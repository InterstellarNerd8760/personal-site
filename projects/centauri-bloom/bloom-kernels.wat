;; Bloom WASM SIMD kernels. Build with: node tools/build-bloom-wasm.mjs
;; All pointers are byte offsets into the imported memory; all tensors are f32.
(module
  (import "env" "mem" (memory 1))

  ;; out[m, n] (+)= b[n] + sum_k x[m, k] * w[n, k]
  ;; Requires N % 4 == 0 and K % 4 == 0. b == 0 means no bias; acc != 0 adds into out.
  (func (export "matmul")
    (param $x i32) (param $w i32) (param $b i32) (param $out i32)
    (param $M i32) (param $N i32) (param $K i32) (param $acc i32)
    (local $n i32) (local $m i32) (local $k i32) (local $kb i32)
    (local $w0 i32) (local $w1 i32) (local $w2 i32) (local $w3 i32)
    (local $xp i32) (local $op i32)
    (local $a0 v128) (local $a1 v128) (local $a2 v128) (local $a3 v128) (local $xv v128)
    (local $r v128)
    (local.set $kb (i32.shl (local.get $K) (i32.const 2)))
    (local.set $n (i32.const 0))
    (block $nd (loop $nl
      (br_if $nd (i32.ge_u (local.get $n) (local.get $N)))
      (local.set $w0 (i32.add (local.get $w) (i32.mul (local.get $n) (local.get $kb))))
      (local.set $w1 (i32.add (local.get $w0) (local.get $kb)))
      (local.set $w2 (i32.add (local.get $w1) (local.get $kb)))
      (local.set $w3 (i32.add (local.get $w2) (local.get $kb)))
      (local.set $m (i32.const 0))
      (block $md (loop $ml
        (br_if $md (i32.ge_u (local.get $m) (local.get $M)))
        (local.set $xp (i32.add (local.get $x) (i32.mul (local.get $m) (local.get $kb))))
        (local.set $a0 (v128.const f32x4 0 0 0 0))
        (local.set $a1 (v128.const f32x4 0 0 0 0))
        (local.set $a2 (v128.const f32x4 0 0 0 0))
        (local.set $a3 (v128.const f32x4 0 0 0 0))
        (local.set $k (i32.const 0))
        (block $kd (loop $kl
          (br_if $kd (i32.ge_u (local.get $k) (local.get $kb)))
          (local.set $xv (v128.load (i32.add (local.get $xp) (local.get $k))))
          (local.set $a0 (f32x4.add (local.get $a0) (f32x4.mul (local.get $xv) (v128.load (i32.add (local.get $w0) (local.get $k))))))
          (local.set $a1 (f32x4.add (local.get $a1) (f32x4.mul (local.get $xv) (v128.load (i32.add (local.get $w1) (local.get $k))))))
          (local.set $a2 (f32x4.add (local.get $a2) (f32x4.mul (local.get $xv) (v128.load (i32.add (local.get $w2) (local.get $k))))))
          (local.set $a3 (f32x4.add (local.get $a3) (f32x4.mul (local.get $xv) (v128.load (i32.add (local.get $w3) (local.get $k))))))
          (local.set $k (i32.add (local.get $k) (i32.const 16)))
          (br $kl)))
        ;; transpose-reduce: r = [sum a0, sum a1, sum a2, sum a3]
        (local.set $a0 (f32x4.add
          (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $a0) (local.get $a1))
          (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $a0) (local.get $a1))))
        (local.set $a2 (f32x4.add
          (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $a2) (local.get $a3))
          (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $a2) (local.get $a3))))
        ;; a0 = [a0x+a0z, a1x+a1z, a0y+a0w, a1y+a1w], a2 likewise for rows 2,3
        (local.set $r (f32x4.add
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23 (local.get $a0) (local.get $a2))
          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31 (local.get $a0) (local.get $a2))))
        (local.set $op (i32.add (local.get $out)
          (i32.shl (i32.add (i32.mul (local.get $m) (local.get $N)) (local.get $n)) (i32.const 2))))
        (if (local.get $b)
          (then (local.set $r (f32x4.add (local.get $r)
            (v128.load (i32.add (local.get $b) (i32.shl (local.get $n) (i32.const 2))))))))
        (if (local.get $acc)
          (then (local.set $r (f32x4.add (local.get $r) (v128.load (local.get $op))))))
        (v128.store (local.get $op) (local.get $r))
        (local.set $m (i32.add (local.get $m) (i32.const 1)))
        (br $ml)))
      (local.set $n (i32.add (local.get $n) (i32.const 4)))
      (br $nl))))

  ;; scores[h * stride + j] = scale * dot(q[h], k[j, h]) for j in 0..=t.
  ;; Requires hd % 4 == 0. width is the row stride of the K cache in floats.
  (func (export "scores")
    (param $q i32) (param $kc i32) (param $sc i32) (param $t i32)
    (param $heads i32) (param $hd i32) (param $width i32) (param $stride i32) (param $scale f32)
    (local $h i32) (local $j i32) (local $d i32) (local $hb i32) (local $rb i32)
    (local $qp i32) (local $kp i32) (local $sp i32) (local $a v128)
    (local.set $hb (i32.shl (local.get $hd) (i32.const 2)))
    (local.set $rb (i32.shl (local.get $width) (i32.const 2)))
    (local.set $h (i32.const 0))
    (block $hd_ (loop $hl
      (br_if $hd_ (i32.ge_u (local.get $h) (local.get $heads)))
      (local.set $qp (i32.add (local.get $q) (i32.mul (local.get $h) (local.get $hb))))
      (local.set $sp (i32.add (local.get $sc) (i32.shl (i32.mul (local.get $h) (local.get $stride)) (i32.const 2))))
      (local.set $kp (i32.add (local.get $kc) (i32.mul (local.get $h) (local.get $hb))))
      (local.set $j (i32.const 0))
      (block $jd (loop $jl
        (br_if $jd (i32.gt_u (local.get $j) (local.get $t)))
        (local.set $a (v128.const f32x4 0 0 0 0))
        (local.set $d (i32.const 0))
        (block $dd (loop $dl
          (br_if $dd (i32.ge_u (local.get $d) (local.get $hb)))
          (local.set $a (f32x4.add (local.get $a) (f32x4.mul
            (v128.load (i32.add (local.get $qp) (local.get $d)))
            (v128.load (i32.add (local.get $kp) (local.get $d))))))
          (local.set $d (i32.add (local.get $d) (i32.const 16)))
          (br $dl)))
        (f32.store (local.get $sp) (f32.mul (local.get $scale) (f32.add
          (f32.add (f32x4.extract_lane 0 (local.get $a)) (f32x4.extract_lane 1 (local.get $a)))
          (f32.add (f32x4.extract_lane 2 (local.get $a)) (f32x4.extract_lane 3 (local.get $a))))))
        (local.set $sp (i32.add (local.get $sp) (i32.const 4)))
        (local.set $kp (i32.add (local.get $kp) (local.get $rb)))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $jl)))
      (local.set $h (i32.add (local.get $h) (i32.const 1)))
      (br $hl))))

  ;; out[h] = sum_j p[h * stride + j] * v[j, h] for j in 0..=t (p already normalised).
  (func (export "wsum")
    (param $p i32) (param $vc i32) (param $out i32) (param $t i32)
    (param $heads i32) (param $hd i32) (param $width i32) (param $stride i32)
    (local $h i32) (local $j i32) (local $d i32) (local $hb i32) (local $rb i32)
    (local $op i32) (local $vp i32) (local $pp i32) (local $wt v128)
    (local.set $hb (i32.shl (local.get $hd) (i32.const 2)))
    (local.set $rb (i32.shl (local.get $width) (i32.const 2)))
    (local.set $h (i32.const 0))
    (block $hd_ (loop $hl
      (br_if $hd_ (i32.ge_u (local.get $h) (local.get $heads)))
      (local.set $op (i32.add (local.get $out) (i32.mul (local.get $h) (local.get $hb))))
      (local.set $d (i32.const 0))
      (block $zd (loop $zl
        (br_if $zd (i32.ge_u (local.get $d) (local.get $hb)))
        (v128.store (i32.add (local.get $op) (local.get $d)) (v128.const f32x4 0 0 0 0))
        (local.set $d (i32.add (local.get $d) (i32.const 16)))
        (br $zl)))
      (local.set $pp (i32.add (local.get $p) (i32.shl (i32.mul (local.get $h) (local.get $stride)) (i32.const 2))))
      (local.set $vp (i32.add (local.get $vc) (i32.mul (local.get $h) (local.get $hb))))
      (local.set $j (i32.const 0))
      (block $jd (loop $jl
        (br_if $jd (i32.gt_u (local.get $j) (local.get $t)))
        (local.set $wt (f32x4.splat (f32.load (local.get $pp))))
        (local.set $d (i32.const 0))
        (block $dd (loop $dl
          (br_if $dd (i32.ge_u (local.get $d) (local.get $hb)))
          (v128.store (i32.add (local.get $op) (local.get $d)) (f32x4.add
            (v128.load (i32.add (local.get $op) (local.get $d)))
            (f32x4.mul (local.get $wt) (v128.load (i32.add (local.get $vp) (local.get $d))))))
          (local.set $d (i32.add (local.get $d) (i32.const 16)))
          (br $dl)))
        (local.set $pp (i32.add (local.get $pp) (i32.const 4)))
        (local.set $vp (i32.add (local.get $vp) (local.get $rb)))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $jl)))
      (local.set $h (i32.add (local.get $h) (i32.const 1)))
      (br $hl))))
)
