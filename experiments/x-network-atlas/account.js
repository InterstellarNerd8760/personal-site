/* Static, sourced account observatory. Reads only a public same-origin aggregate JSON file. */
(()=>{'use strict';
const source=document.querySelector('[data-atlas-data]');
if(!source)return;
fetch(source.getAttribute('data-atlas-data'),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Data not available');return r.json();}).then(data=>{
  if(data.handle!=='rosch_weston'||!data.annual||!data.accountSnapshot)return;
  const values={
   'impressions':data.annual.impressions.display,
   'engagements':data.annual.engagements.display,
   'visits':data.annual.profileVisits.display,
   'followers':data.accountSnapshot.followers.display,
   'verified':data.accountSnapshot.verifiedFollowers.display,
   'posts':data.accountSnapshot.posts.display
  };
  // Ratios are derived only from same-window reported aggregates; never from follower snapshots.
  const impressions = Number(data.annual.impressions.value);
  const rates = {
    engagements: Number(data.annual.engagements.value),
    visits: Number(data.annual.profileVisits.value)
  };
  document.querySelectorAll('[data-derived-rate]').forEach(el => {
    const kind = el.getAttribute('data-derived-rate');
    const numerator = rates[kind];
    if (Number.isFinite(impressions) && impressions > 0 && Number.isFinite(numerator) && numerator >= 0) {
      el.textContent = '~' + (100 * numerator / impressions).toFixed(kind === 'visits' ? 2 : 1) + '%';
    }
  });
  document.querySelectorAll('[data-metric-value]').forEach(el=>{
    const key=el.getAttribute('data-metric-value');
    if(values[key]!==undefined)el.textContent=values[key];
  });
  const updated=document.querySelector('[data-as-of]');
  if(updated)updated.textContent='Source snapshot: '+data.capturedDate+' · User-reported; not a live API feed';
  const obs=data.followerObservations||[];
  document.querySelectorAll('[data-follower-date]').forEach(el=>{
    const found=obs.find(x=>x.date===el.getAttribute('data-follower-date'));
    if(found){
      const val=el.querySelector('[data-snapshot-value]');
      if(val)val.textContent=(found.approximate?'~':'')+found.value.toLocaleString();
    }
  });
}).catch(()=>{const hint=document.querySelector('[data-as-of]');if(hint)hint.textContent='Static snapshot shown · Data file could not be refreshed';});
})();