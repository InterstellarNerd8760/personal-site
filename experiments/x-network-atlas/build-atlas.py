#!/usr/bin/env python3
"""Rebuild experiments/x-network-atlas/x-atlas.json from local public-X lookup dumps.

This script does not call X. Drop page JSON objects (the `data` / `includes` /
`meta` payloads) into a directory and pass that path as the first argument.
The live page reads only the aggregated snapshot, which omits post bodies.

Example:
    python3 build-atlas.py /tmp/x-atlas-raw
"""
from __future__ import annotations

import collections
import datetime as dt
import json
import pathlib
import re
import sys

CENTER_ID = "1989871836725944320"
CENTER = "rosch_weston"
PT = dt.timezone(dt.timedelta(hours=-8))
WINDOW_START = dt.datetime(2026, 11, 5, 0, 0, 0, tzinfo=PT)
HANDLE_RE = re.compile(r"^[a-z0-9_]{1,15}$")
SORSA_SEEDS = [
    "space_jm_",
    "astro_kep",
    "mathsboi42",
    "GoodAaron",
    "RickAddante",
    "Miss1onControl",
    "farzyness",
    "Hugh__Mann",
    "ApoStructura",
    "Echo5550",
]
# Keep the on-page graph readable.
MIN_WEIGHT = 2
MAX_NODES = 200  # include every account at or above MIN_WEIGHT


def parse_dt(value: str) -> dt.datetime:
    return dt.datetime.strptime(value.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S.%f%z")


def in_window(value: str, window_end: dt.datetime) -> bool:
    stamp = parse_dt(value)
    return WINDOW_START <= stamp <= window_end


def refs(post: dict) -> list:
    return post.get("referenced_tweets") or post.get("referenced_posts") or []


def ref_types(post: dict) -> set:
    return {item["type"] for item in refs(post)}


def mentions_of(post: dict) -> list:
    return (post.get("entities") or {}).get("mentions") or []


def load_pages(raw_dir: pathlib.Path):
    posts = {}
    users = {}
    included_posts = {}
    for path in sorted(raw_dir.glob("*.json")):
        obj = json.loads(path.read_text())
        includes = obj.get("includes") or {}
        for user in includes.get("users") or []:
            if user.get("id"):
                users[user["id"]] = user
        for item in includes.get("tweets") or includes.get("posts") or []:
            included_posts[item["id"]] = item
        for post in obj.get("data") or []:
            posts[post["id"]] = post
    return posts, users, included_posts


def handle_for_id(users: dict, user_id: str | None) -> str | None:
    if not user_id:
        return None
    user = users.get(user_id)
    if user and user.get("username"):
        return user["username"].lower()
    return None


def classify(post: dict) -> str:
    types = ref_types(post)
    if "retweeted" in types:
        return "retweet"
    if "replied_to" in types or post.get("in_reply_to_user_id"):
        return "reply"
    if "quoted" in types:
        return "quote"
    return "original"


def public_metrics(post: dict) -> dict:
    metrics = post.get("public_metrics") or {}
    return {
        "likes": metrics.get("like_count") or 0,
        "replies": metrics.get("reply_count") or 0,
        "reposts": metrics.get("retweet_count", metrics.get("repost_count", 0)) or 0,
        "quotes": metrics.get("quote_count") or 0,
        "bookmarks": metrics.get("bookmark_count") or 0,
        "impressions": metrics.get("impression_count") or 0,
    }


def add_edge(edges, evidence, handle, typ, post_id):
    if not handle:
        return
    handle = handle.lower().lstrip("@")
    if handle == CENTER or not HANDLE_RE.fullmatch(handle):
        return
    edges[handle][typ] += 1
    if len(evidence[handle]) < 12:
        evidence[handle].append({"type": typ, "postId": post_id})


def kind_for(counts: dict) -> str:
    outbound = counts.get("reply_to", 0) + counts.get("mention_out", 0) + counts.get("quote", 0)
    inbound = counts.get("reply_from", 0) + counts.get("mention_from", 0) + counts.get("quote_from", 0)
    amplify = counts.get("repost", 0)
    if outbound and inbound:
        return "mutual"
    if outbound:
        return "outbound"
    if inbound:
        return "inbound"
    if amplify:
        return "amplify"
    return "outbound"


def layout(nodes: list[dict]) -> None:
    groups = collections.defaultdict(list)
    for node in nodes:
        groups[node["kind"]].append(node)
    sectors = {
        "mutual": (-40, 140),
        "outbound": (150, 250),
        "inbound": (258, 300),
        "amplify": (308, 340),
    }
    # Inner/outer radius by cluster. Large groups are split across rings.
    rings = {
        "mutual": (150, 300),
        "outbound": (230, 420),
        "inbound": (240, 360),
        "amplify": (330, 410),
    }
    for kind, group in groups.items():
        group.sort(key=lambda node: (-node["weight"], node["handle"]))
        start, end = sectors[kind]
        inner, outer = rings[kind]
        span = end - start
        count = len(group)
        ring_count = 1 if count <= 8 else (2 if count <= 18 else 3)
        for index, node in enumerate(group):
            ring = index % ring_count
            slot = index // ring_count
            slots = (count - ring + ring_count - 1) // ring_count
            frac = (slot + 0.5) / max(slots, 1)
            angle = start + frac * span
            if ring_count == 1:
                t = 0.35
            else:
                t = ring / (ring_count - 1)
            radius = inner + t * (outer - inner)
            radius += (slot % 2) * 10 - 5
            node["angle"] = round(angle, 2)
            node["radius"] = round(radius, 2)


def build(raw_dir: pathlib.Path) -> dict:
    posts, users, included_posts = load_pages(raw_dir)
    weston_all = [post for post in posts.values() if post.get("author_id") == CENTER_ID and post.get("created_at")]
    if not weston_all:
        raise SystemExit("No posts by @rosch_weston found in the raw dumps.")
    last_post = max(weston_all, key=lambda post: post["created_at"])
    window_end = parse_dt(last_post["created_at"])
    as_of = dt.datetime(2026, 11, 19, 12, 20, 0, tzinfo=PT)

    weston_posts = [post for post in weston_all if in_window(post["created_at"], window_end)]
    incoming = [
        post
        for post in posts.values()
        if post.get("author_id") != CENTER_ID and post.get("created_at") and in_window(post["created_at"], window_end)
    ]
    weston_posts.sort(key=lambda post: post["created_at"])
    incoming.sort(key=lambda post: post["created_at"])

    type_counts = collections.Counter()
    metrics_sum = collections.Counter()
    metrics_by_type = {key: collections.Counter() for key in ("original", "reply", "quote", "retweet")}
    daily = collections.defaultdict(lambda: collections.Counter())
    edges = collections.defaultdict(lambda: collections.Counter())
    evidence = collections.defaultdict(list)
    conversations = collections.defaultdict(set)

    def author_of_ref(ref: dict) -> str | None:
        included = included_posts.get(ref.get("id")) or {}
        return handle_for_id(users, included.get("author_id"))

    for post in weston_posts:
        kind = classify(post)
        type_counts[kind] += 1
        day = parse_dt(post["created_at"]).astimezone(PT).date().isoformat()
        daily[day][kind] += 1
        daily[day]["total"] += 1
        metrics = public_metrics(post)
        if kind != "retweet":
            metrics_sum["posts"] += 1
            for key, value in metrics.items():
                metrics_sum[key] += value
                metrics_by_type[kind][key] += value
            metrics_by_type[kind]["posts"] += 1

        mentioned = mentions_of(post)
        if kind == "retweet":
            target = None
            for ref in refs(post):
                if ref["type"] == "retweeted":
                    target = author_of_ref(ref)
            if not target and mentioned:
                target = (mentioned[0].get("username") or "").lower()
            add_edge(edges, evidence, target, "repost", post["id"])
            if post.get("conversation_id") and target:
                conversations[post["conversation_id"]].add(target)
            continue

        reply_target = None
        if post.get("in_reply_to_user_id") and post["in_reply_to_user_id"] != CENTER_ID:
            reply_target = handle_for_id(users, post["in_reply_to_user_id"])
            if not reply_target:
                for mention in mentioned:
                    if mention.get("id") == post["in_reply_to_user_id"]:
                        reply_target = (mention.get("username") or "").lower()
            add_edge(edges, evidence, reply_target, "reply_to", post["id"])

        quote_targets = set()
        if "quoted" in ref_types(post):
            for ref in refs(post):
                if ref["type"] == "quoted":
                    handle = author_of_ref(ref)
                    if handle and handle not in {CENTER, reply_target}:
                        quote_targets.add(handle)
            for handle in quote_targets:
                add_edge(edges, evidence, handle, "quote", post["id"])

        seen = set()
        if reply_target:
            seen.add(reply_target)
        seen |= quote_targets
        for mention in mentioned:
            handle = (mention.get("username") or "").lower()
            if handle and handle not in seen and handle != CENTER:
                add_edge(edges, evidence, handle, "mention_out", post["id"])
                seen.add(handle)
        if post.get("conversation_id"):
            for handle in seen:
                conversations[post["conversation_id"]].add(handle)

    for post in incoming:
        user = users.get(post.get("author_id") or "")
        if not user or not user.get("username"):
            continue
        handle = user["username"].lower()
        types = ref_types(post)
        if "quoted" in types and "replied_to" not in types and post.get("in_reply_to_user_id") != CENTER_ID:
            typ = "quote_from"
        elif post.get("in_reply_to_user_id") == CENTER_ID or "replied_to" in types:
            typ = "reply_from"
        else:
            typ = "mention_from"
        add_edge(edges, evidence, handle, typ, post["id"])
        if post.get("conversation_id"):
            conversations[post["conversation_id"]].add(handle)
            for mention in mentions_of(post):
                other = (mention.get("username") or "").lower()
                if other and other != CENTER:
                    conversations[post["conversation_id"]].add(other)

    def weight_of(handle: str) -> int:
        return int(sum(edges[handle].values()))

    ranked = sorted(edges, key=lambda handle: (-weight_of(handle), handle))
    displayed = [handle for handle in ranked if weight_of(handle) >= MIN_WEIGHT][:MAX_NODES]

    handle_to_user = {user["username"].lower(): user for user in users.values() if user.get("username")}

    nodes = []
    for handle in displayed:
        counts = dict(edges[handle])
        user = handle_to_user.get(handle) or {}
        metrics = user.get("public_metrics") or {}
        nodes.append(
            {
                "handle": handle,
                "name": user.get("name") or ("@" + handle),
                "kind": kind_for(counts),
                "weight": weight_of(handle),
                "counts": {
                    "replyTo": counts.get("reply_to", 0),
                    "mentionOut": counts.get("mention_out", 0),
                    "quote": counts.get("quote", 0),
                    "repost": counts.get("repost", 0),
                    "replyFrom": counts.get("reply_from", 0),
                    "mentionFrom": counts.get("mention_from", 0),
                    "quoteFrom": counts.get("quote_from", 0),
                },
                "profile": {
                    "followers": metrics.get("followers_count"),
                    "following": metrics.get("following_count"),
                    "posts": metrics.get("tweet_count", metrics.get("post_count")),
                    "verified": bool(user.get("verified")),
                }
                if metrics
                else None,
            }
        )
    layout(nodes)

    co_counts = collections.Counter()
    displayed_set = set(displayed)
    for handles in conversations.values():
        present = sorted(handle for handle in handles if handle in displayed_set)
        for i, left in enumerate(present):
            for right in present[i + 1 :]:
                co_counts[(left, right)] += 1
    cooccurrence = [
        {"source": left, "target": right, "weight": weight}
        for (left, right), weight in sorted(co_counts.items(), key=lambda item: (-item[1], item[0]))
        if weight >= 2
    ]

    top_posts = []
    scored = []
    for post in weston_posts:
        if classify(post) == "retweet":
            continue
        metrics = public_metrics(post)
        scored.append((metrics["impressions"], metrics["likes"], metrics["replies"], post, metrics))
    scored.sort(key=lambda row: (row[0], row[1], row[2]), reverse=True)
    for impressions, likes, replies, post, metrics in scored[:8]:
        kind = classify(post)
        # Do not publish post text; this site should not quote casual replies.
        reply_handle = None
        if post.get("in_reply_to_user_id"):
            reply_handle = handle_for_id(users, post["in_reply_to_user_id"])
        top_posts.append(
            {
                "id": post["id"],
                "url": post.get("url") or f"https://x.com/rosch_weston/status/{post['id']}",
                "createdAt": post["created_at"],
                "kind": kind,
                "replyTo": reply_handle,
                "impressions": metrics["impressions"],
                "likes": metrics["likes"],
                "replies": metrics["replies"],
                "reposts": metrics["reposts"],
                "quotes": metrics["quotes"],
            }
        )

    daily_rows = []
    for day in sorted(daily):
        row = daily[day]
        daily_rows.append(
            {
                "date": day,
                "total": row["total"],
                "original": row["original"],
                "reply": row["reply"],
                "quote": row["quote"],
                "retweet": row["retweet"],
            }
        )

    sorsa_in = []
    sorsa_out = []
    for seed in SORSA_SEEDS:
        handle = seed.lower()
        if handle in edges:
            sorsa_in.append({"handle": handle, "weight": weight_of(handle), "counts": dict(edges[handle])})
        else:
            sorsa_out.append(seed)

    first_pt = parse_dt(weston_posts[0]["created_at"]).astimezone(PT)
    last_pt = parse_dt(weston_posts[-1]["created_at"]).astimezone(PT)

    profile_user = users.get(CENTER_ID) or handle_to_user.get(CENTER) or {}
    # Profile metrics were taken from a dedicated user lookup, not necessarily
    # present in post includes. They are passed in via a sidecar if needed.
    return {
        "version": 3,
        "handle": CENTER,
        "userId": CENTER_ID,
        "accountUrl": "https://x.com/rosch_weston",
        "asOf": as_of.isoformat(),
        "asOfDisplay": "Nov 19, 2026, 12:20 PM PT",
        "sourceType": "Public X profile and post lookups, stored as a static snapshot. Not a live on-page API, and not X Analytics.",
        "window": {
            "start": WINDOW_START.isoformat(),
            "end": window_end.astimezone(PT).isoformat(),
            "timezone": "America/Los_Angeles",
            "label": "12:00 AM PT Nov 5 through 10:26 AM PT Nov 19, 2026",
            "firstPostAt": first_pt.isoformat(),
            "lastPostAt": last_pt.isoformat(),
        },
        "profile": None,  # filled below by main()
        "sample": {
            "postsCollected": len(weston_posts),
            "byType": {
                "original": type_counts["original"],
                "reply": type_counts["reply"],
                "quote": type_counts["quote"],
                "retweet": type_counts["retweet"],
            },
            "nonRetweet": {
                "posts": int(metrics_sum["posts"]),
                "impressions": int(metrics_sum["impressions"]),
                "likes": int(metrics_sum["likes"]),
                "replies": int(metrics_sum["replies"]),
                "reposts": int(metrics_sum["reposts"]),
                "quotes": int(metrics_sum["quotes"]),
                "bookmarks": int(metrics_sum["bookmarks"]),
            },
            "incomingPostsCollected": len(incoming),
            "accountsWithInteractions": len(ranked),
            "daily": daily_rows,
            "topPosts": top_posts,
        },
        "network": {
            "minWeight": MIN_WEIGHT,
            "nodeLimit": MAX_NODES,
            "displayedAccounts": len(nodes),
            "nodes": nodes,
            "cooccurrenceEdges": cooccurrence,
            "sorsaSeedsInWindow": sorsa_in,
            "sorsaSeedsAbsent": sorsa_out,
        },
        "method": {
            "summary": "An interaction is one public post in the sample window that ties my account to another: I replied to, mentioned, quoted, or reposted them, or they replied to, mentioned, or quoted me. Each such post adds 1 to that account's weight. Additional people mentioned in the same post are also counted once. Self-replies are omitted. Likes, follows, and DMs are not counted. This is not a follower graph.",
            "calls": "Looked up the public profile for @rosch_weston, then paged through every post and @mention in the window (25 results per request). Account metrics on the graph come from the user objects returned with those posts.",
            "clusters": "mutual = replies, mentions, or quotes in both directions; outbound = I reached out and they did not reply in this window; inbound = they reached out and I did not reply in this window; amplify = I only reposted them. Thin links between accounts mean they appeared in the same public conversation as me at least twice, not that they follow each other.",
            "seeds": "An earlier Sorsa follower snapshot listed 10 accounts. Those handles were used only as names to check against this window. Seven appear below. Three had no counted public interactions here and are not shown as live nodes.",
        },
        "unavailable": [
            "Verified follower count (the public lookup is not authorized for that field)",
            "X Analytics private year-long totals such as profile visits",
            "Follower and following lists",
            "Likes, follows, and DMs as interactions",
        ],
        "ranking": [
            {
                "handle": handle,
                "weight": weight_of(handle),
                "counts": dict(edges[handle]),
                "kind": kind_for(dict(edges[handle])),
            }
            for handle in ranked[:15]
        ],
        "_debugUsersPresent": CENTER_ID in users,
    }


PROFILE = {
    "name": "Weston Rosch",
    "username": "rosch_weston",
    "createdAt": "2025-11-16T01:43:46.000Z",
    "followers": 170,
    "following": 964,
    "posts": 4833,
    "likesGiven": 18890,
    "listed": 2,
    "media": 445,
    "verified": True,
    "verifiedType": "blue",
    "protected": False,
}


def main():
    raw_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/x-atlas-raw")
    out = pathlib.Path(__file__).resolve().parent / "x-atlas.json"
    data = build(raw_dir)
    data["profile"] = PROFILE
    data.pop("_debugUsersPresent", None)
    out.write_text(json.dumps(data, indent=2) + "\n")
    print("Wrote", out)
    print("posts", data["sample"]["postsCollected"], "accounts", data["sample"]["accountsWithInteractions"])
    print("nodes", data["network"]["displayedAccounts"], "cooc", len(data["network"]["cooccurrenceEdges"]))
    print("top", data["ranking"][:10])


if __name__ == "__main__":
    main()
