let ctx;
let masterBus;

// ---------------------------------------------------------------------------
// TRẠNG THÁI KHOÁ ÂM THANH
// Trình duyệt khoá không cho phát tiếng cho tới khi người dùng có thao tác
// (bấm/chạm). Máy của người BẤM NÚT được mở khoá ngay nhờ chính cú bấm đó;
// máy của người khác chỉ ngồi nhìn nên vẫn bị khoá -> chuông chạy mà câm.
// Đây chính là lý do chỉ người thao tác nghe được tiếng.
// ---------------------------------------------------------------------------
const extraContexts = new Set();   // bộ âm thanh riêng của alarmSound.js
const blockedListeners = new Set();
let audioBlocked = false;

// alarmSound.js gọi hàm này để bộ âm thanh của nó cũng được mở khoá cùng lúc.
export function registerAudioContext(c) {
  if (c) extraContexts.add(c);
}

function allContexts() {
  return [ctx, ...extraContexts].filter(Boolean);
}

function setBlocked(v) {
  if (audioBlocked === v) return;
  audioBlocked = v;
  for (const cb of blockedListeners) {
    try { cb(v); } catch (e) { console.error('[Sound] listener error:', e); }
  }
}

export function isAudioBlocked() {
  return audioBlocked;
}

export function subscribeAudioBlocked(cb) {
  blockedListeners.add(cb);
  cb(audioBlocked);
  return () => blockedListeners.delete(cb);
}

// Mở khoá TẤT CẢ bộ âm thanh. Trả về true nếu đã sẵn sàng phát tiếng.
export async function unlockAudioNow() {
  try {
    getCtx();
    const list = allContexts();
    await Promise.all(
      list.map((c) => (c.state === 'suspended' ? c.resume().catch(() => {}) : Promise.resolve()))
    );
    const ok = allContexts().every((c) => c.state === 'running');
    setBlocked(!ok);
    return ok;
  } catch (e) {
    console.error('[Sound] unlockAudioNow error:', e);
    setBlocked(true);
    return false;
  }
}

// Chỉ lên lịch phát tiếng KHI bộ âm thanh đang chạy thật.
// Nếu còn khoá thì thử mở rồi mới phát — tránh hai chuyện:
//  * lên lịch vào bộ đang khoá -> mất tiếng hoàn toàn
//  * các tiếng bị dồn ứ, tới lúc mở khoá thì nổ ra cùng lúc (nghẹn tiếng)
// Sổ theo dõi các tiếng ĐANG phát dở, để tắt chúng trước khi phát tiếng mới.
// Đây là cách tương đương "audio.currentTime = 0" cho âm thanh tạo bằng Web
// Audio: thay vì chồng tiếng lên nhau thành tạp âm khi thông báo dồn dập,
// tiếng cũ được tắt mượt (30ms) rồi tiếng mới bắt đầu lại từ đầu.
const activeNodes = new Set();

function stopActiveSounds() {
  if (!ctx || activeNodes.size === 0) return;
  const now = ctx.currentTime;
  for (const node of activeNodes) {
    try {
      // Cắt NHANH (8ms) chứ không phải 30ms: khi 5 thông báo ập tới gần như
      // cùng lúc, mỗi mili-giây chồng tiếng đều cộng dồn biên độ. Đo thực tế
      // cho thấy cắt chậm thì 5 tiếng cùng lúc đẩy đỉnh lên 2.83 (vỡ tiếng).
      // 8ms đủ ngắn để không cộng dồn, đủ dài để không nghe thành tiếng "tách".
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setValueAtTime(Math.max(node.gain.gain.value, 0.0001), now);
      node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);
      node.osc.stop(now + 0.02);
    } catch (e) { /* nốt đã dừng rồi thì bỏ qua */ }
  }
  activeNodes.clear();
}

function withRunningCtx(run) {
  let audioCtx;
  try { audioCtx = getCtx(); } catch (e) { console.error('[Sound] getCtx error:', e); return; }

  if (audioCtx.state === 'running') {
    setBlocked(false);
    stopActiveSounds();   // tiếng mới bắt đầu lại từ đầu, không chồng lên tiếng cũ
    run();
    return;
  }

  setBlocked(true);
  audioCtx.resume()
    .then(() => {
      if (audioCtx.state === 'running') { setBlocked(false); stopActiveSounds(); run(); }
      else console.warn('[Sound] Trình duyệt vẫn chặn — cần người dùng bấm "Bật âm thanh".');
    })
    .catch((e) => console.warn('[Sound] Không mở được âm thanh:', e?.message || e));
}

// Đường ra chung cho MỌI tiếng chuông trong app.
// Nén động (compressor) + khuếch đại bù (makeup gain): cho phép đẩy âm lượng
// lên sát mức tối đa mà không bị rè/vỡ tiếng khi nhiều nốt chồng nhau.
// Đây là cách tăng độ to cho âm thanh tạo bằng Web Audio — không có thẻ
// <audio> hay new Audio() nào để đặt .volume = 1.0.
function getMasterBus(audioCtx) {
  if (masterBus) return masterBus;
  // Bộ số dưới đây được chọn bằng cách đo thực tế (OfflineAudioContext):
  // to nhất có thể mà đỉnh tín hiệu vẫn <= 0.91 nên KHÔNG bị rè, kể cả ở
  // trường hợp nặng nhất là 5 nốt cùng tần số chồng lên nhau.
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -30;  // nén sớm
  comp.knee.value = 20;
  comp.ratio.value = 20;       // nén mạnh -> nâng được makeup gain cao
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  const makeup = audioCtx.createGain();
  makeup.gain.value = 1.9;     // bù lại phần bị nén -> to gấp ~2.6 lần trước

  // TẦNG CHẶN ĐỈNH cuối cùng. Một thông báo đơn lẻ thì makeup 1.9 vừa đẹp,
  // nhưng khi nhiều thông báo ập tới gần như cùng lúc thì biên độ cộng dồn
  // vượt ngưỡng 1.0 và tiếng bị vỡ/rè. Đo thực tế: 5 thông báo cùng lúc đẩy
  // đỉnh lên 2.83. Tầng này ghìm mọi thứ xuống dưới ngưỡng, dù dồn bao nhiêu.
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;      // chặn dứt khoát, không bo tròn
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001; // bắt kịp cả tiếng đột ngột
  limiter.release.value = 0.05;

  comp.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(audioCtx.destination);
  masterBus = comp;
  return masterBus;
}

export function getAudioBus() {
  const audioCtx = getCtx();
  return { audioCtx, bus: getMasterBus(audioCtx) };
}

// Chống kêu chồng: một mốc có thể được báo qua hai đường (tín hiệu trực tiếp
// và thay đổi trong cơ sở dữ liệu). Nếu cùng một loại chuông được yêu cầu hai
// lần trong 3 giây thì chỉ phát lần đầu.
const lastPlayedAt = new Map();
export function playOnce(key, fn, windowMs = 3000) {
  const now = Date.now();
  const prev = lastPlayedAt.get(key) || 0;
  if (now - prev < windowMs) {
    console.log(`[Sound] Bỏ qua "${key}" — vừa phát cách đây ${now - prev}ms`);
    return false;
  }
  lastPlayedAt.set(key, now);
  fn();
  return true;
}

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Resume context nếu suspended (bypass autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(e => console.error('[Sound] Resume failed:', e));
  }

  return ctx;
}

// volume mặc định đẩy lên sát tối đa; compressor lo phần chống rè.
function beep({ freq = 880, duration = 0.15, delay = 0, type = 'sine', volume = 1.0 } = {}) {
  try {
    const audioCtx = getCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(getMasterBus(audioCtx));
    const startTime = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(Math.min(volume, 1), startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);

    const node = { osc, gain };
    activeNodes.add(node);
    osc.onended = () => activeNodes.delete(node);
  } catch (e) {
    console.error('[beep] Error:', e);
  }
}

export function initAudioUnlock() {
  // LỖI CŨ: bộ nghe tự gỡ ngay sau cú bấm ĐẦU TIÊN, bất kể mở khoá có thành
  // công hay không. resume() chạy bất đồng bộ nên nếu chưa kịp xong thì bộ
  // nghe đã biến mất — không còn lần thử thứ hai, máy đó câm vĩnh viễn.
  // SỬA: chỉ gỡ khi ĐÃ mở khoá thật sự, và thử lại ở mọi thao tác.
  const tryUnlock = () => {
    unlockAudioNow().then((ok) => {
      if (!ok) return;
      window.removeEventListener('click', tryUnlock);
      window.removeEventListener('touchstart', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
      console.log('[Sound] ✓ Âm thanh đã sẵn sàng');
    });
  };

  window.addEventListener('click', tryUnlock, { passive: true });
  window.addEventListener('touchstart', tryUnlock, { passive: true });
  window.addEventListener('keydown', tryUnlock);

  // Điện thoại/máy tính bảng hay tạm dừng âm thanh khi chuyển sang app khác.
  // Quay lại app thì mở khoá lại, nếu không thì im tiếng mà không ai biết.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockAudioNow();
  });
  window.addEventListener('focus', () => { unlockAudioNow(); });

  // Kiểm tra ngay lúc mở app để biết có đang bị chặn không.
  unlockAudioNow();
}

export function playNewOrderSound() {
  withRunningCtx(() => {
    beep({ freq: 880, duration: 0.12 });
    beep({ freq: 1174, duration: 0.18, delay: 0.14 });
  });
}

export function playDeliveredSound() {
  withRunningCtx(() => {
    beep({ freq: 660, duration: 0.1 });
    beep({ freq: 880, duration: 0.1, delay: 0.11 });
    beep({ freq: 1108, duration: 0.22, delay: 0.22 });
  });
}

export function playTingSound() {
  withRunningCtx(() => {
    beep({ freq: 1046, duration: 0.16, type: 'sine', volume: 0.25 });
  });
}

// Play pattern repeated for duration (milliseconds).
// cycleSec: độ dài một chu kỳ, tính cả khoảng lặng cuối để hai lần lặp không dính vào nhau.
function playPatternLooped(pattern, durationMs, cycleSec) {
  // Cổng kiểm tra: chỉ lên lịch khi bộ âm thanh đang chạy thật.
  withRunningCtx(() => schedulePattern(pattern, durationMs, cycleSec));
}

function schedulePattern(pattern, durationMs, cycleSec) {
  try {
    console.log(`[playPatternLooped] Starting pattern loop for ${durationMs}ms`);

    // Calculate pattern duration in seconds
    const notesEndSec = Math.max(...pattern.map(p => p.delay + p.duration));
    const patternDurationSec = cycleSec || notesEndSec;
    const durationSec = durationMs / 1000;
    const iterations = Math.ceil(durationSec / patternDurationSec);

    console.log(`[playPatternLooped] Pattern: ${patternDurationSec.toFixed(2)}s, Iterations: ${iterations}, Total: ~${(iterations * patternDurationSec).toFixed(1)}s`);

    // Schedule all beeps for the pattern repetitions
    for (let i = 0; i < iterations; i++) {
      const timeOffset = i * patternDurationSec;
      for (const note of pattern) {
        const delay = note.delay + timeOffset;
        beep({ freq: note.freq, duration: note.duration, delay, volume: note.volume });
      }
    }

    console.log(`[playPatternLooped] ✓ Scheduled ${iterations} iterations`);
  } catch (e) {
    console.error(`[playPatternLooped] Error:`, e);
  }
}

// NHẬN ĐƠN — "đing-đoong" đi lên, 2 nốt Sol→Đô (lặp 6s)
// Giai điệu riêng để phân biệt với các sự kiện khác.
export function playKitchenReceiveSound() {
  console.log('[playKitchenReceiveSound] Nhận đơn — Sol→Đô đi lên (6s loop)');
  const pattern = [
    { freq: 784, duration: 0.18, delay: 0, volume: 1.0 },    // Sol5
    { freq: 1046, duration: 0.32, delay: 0.22, volume: 1.0 } // Đô6
  ];
  playPatternLooped(pattern, 6000, 1.1); // 0.54s tiếng + 0.56s lặng
  console.log('[playKitchenReceiveSound] ✓ Done');
}

// HOÀN THÀNH MẺ BÁNH — hợp âm trưởng Đô-Mi-Sol đi lên, vui tai (lặp 6s)
export function playKitchenCompleteSound() {
  console.log('[playKitchenCompleteSound] Xong mẻ bánh — Đô-Mi-Sol (6s loop)');
  const pattern = [
    { freq: 523, duration: 0.16, delay: 0, volume: 1.0 },    // Đô5
    { freq: 659, duration: 0.16, delay: 0.19, volume: 1.0 }, // Mi5
    { freq: 784, duration: 0.38, delay: 0.38, volume: 1.0 }   // Sol5 ngân dài
  ];
  playPatternLooped(pattern, 6000, 1.3); // 0.76s tiếng + 0.54s lặng
  console.log('[playKitchenCompleteSound] ✓ Done');
}

// NHẬN GIAO — 2 nốt trầm ấm La→Rê, khác hẳn tiếng bếp (lặp 6s)
export function playShipperReceiveSound() {
  console.log('[playShipperReceiveSound] Nhận giao — La→Rê trầm (6s loop)');
  const pattern = [
    { freq: 440, duration: 0.22, delay: 0, volume: 1.0 },     // La4
    { freq: 587, duration: 0.34, delay: 0.26, volume: 1.0 }   // Rê5
  ];
  playPatternLooped(pattern, 6000, 1.2); // 0.6s tiếng + 0.6s lặng
  console.log('[playShipperReceiveSound] ✓ Done');
}

// TING TING TING TING TING - Shipper hoàn thành giao (lặp 10s)
export function playShipperCompleteSound() {
  console.log('[playShipperCompleteSound] Starting TING TING TING TING TING (10s loop)');
  const pattern = [
    { freq: 1046, duration: 0.12, delay: 0, volume: 1.0 },
    { freq: 1046, duration: 0.12, delay: 0.15, volume: 1.0 },
    { freq: 1046, duration: 0.12, delay: 0.3, volume: 1.0 },
    { freq: 1046, duration: 0.12, delay: 0.45, volume: 1.0 },
    { freq: 1046, duration: 0.12, delay: 0.6, volume: 1.0 }
  ];
  playPatternLooped(pattern, 6000, 1.0); // 0.72s tiếng + 0.28s lặng, đồng bộ 6s như các tiếng khác
  console.log('[playShipperCompleteSound] ✓ Done');
}

export function playNotificationSound(soundKey) {
  if (soundKey === 'new_order_voice') {
    playNewOrderSound();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance('Có đơn mới');
      speech.lang = 'vi-VN'; speech.rate = 0.9; speech.volume = 1;
      window.speechSynthesis.speak(speech);
    }
  } else if (soundKey === 'cash_complete') playDeliveredSound();
  else if (soundKey === 'ting') playTingSound();
  else if (soundKey === 'task_progress') playTaskProgressSound();
  else if (soundKey === 'task_deadline') playDeadlineAlertSound();
  else if (soundKey === 'star_reward') playStarRewardSound();
  else if (soundKey === 'star_penalty') playStarPenaltySound();
}

// GIAO VIỆC — 3 nốt nảy Mi-La-Đô, tươi và gấp gáp, khác hẳn tiếng bếp/shipper
// (Hàm THÊM MỚI. Không đụng tới bất kỳ hàm âm thanh nào đang chạy.)
export function playTaskAssignedSound() {
  console.log('[playTaskAssignedSound] Giao việc — Mi-La-Đô (6s loop)');
  const pattern = [
    { freq: 659, duration: 0.13, delay: 0, volume: 1.0 },     // Mi5
    { freq: 880, duration: 0.13, delay: 0.16, volume: 1.0 },  // La5
    { freq: 1318, duration: 0.3, delay: 0.32, volume: 1.0 },  // Mi6 vút lên
  ];
  playPatternLooped(pattern, 6000, 1.15);
  console.log('[playTaskAssignedSound] ✓ Done');
}

// BÁO CÁO TIẾN ĐỘ / DUYỆT VIỆC — 2 nốt Fa-La ngắn gọn, nhẹ hơn tiếng giao
// việc (không lặp dài 6s vì đây là cập nhật qua lại giữa 2 người, không cần
// "gọi" ai bằng chuông dồn dập như đơn hàng mới).
export function playTaskProgressSound() {
  withRunningCtx(() => {
    beep({ freq: 698, duration: 0.13, type: 'sine' });          // Fa5
    beep({ freq: 880, duration: 0.2, delay: 0.15, type: 'sine' }); // La5
  });
}

// SẮP/ĐÃ QUÁ HẠN VIỆC — 2 tiếng "tít tít" gấp gáp, cao và ngắn, khẩn hơn hẳn
// mọi tiếng khác trong app vì đây là cảnh báo LẶP LẠI mỗi 10 phút cho tới
// khi thợ xử lý xong — cố ý không êm tai để không bị lờ đi.
export function playDeadlineAlertSound() {
  withRunningCtx(() => {
    beep({ freq: 1568, duration: 0.1, type: 'square', volume: 0.7 });
    beep({ freq: 1568, duration: 0.1, delay: 0.14, type: 'square', volume: 0.7 });
  });
}

// GIEO HẠT +SAO — 3 nốt vui, đi lên (Đô-Mi-Sol), báo cho cả người được
// thưởng lẫn toàn công ty (broadcast) — không lặp, 1 lần là đủ "kích lệ".
export function playStarRewardSound() {
  withRunningCtx(() => {
    beep({ freq: 523, duration: 0.13, type: 'sine', volume: 0.85 });        // Đô5
    beep({ freq: 659, duration: 0.13, delay: 0.13, type: 'sine', volume: 0.85 }); // Mi5
    beep({ freq: 784, duration: 0.28, delay: 0.26, type: 'sine', volume: 0.9 });  // Sol5 ngân
  });
}

// GIEO HẠT −SAO — 3 nốt đi xuống, rõ ràng nhưng không chói gắt như cảnh báo
// quá hạn — chủ đích: ai cũng nghe được (đảm bảo đúng quy định), không phải
// "báo động".
export function playStarPenaltySound() {
  withRunningCtx(() => {
    beep({ freq: 784, duration: 0.12, type: 'triangle', volume: 0.8 });        // Sol5
    beep({ freq: 659, duration: 0.12, delay: 0.13, type: 'triangle', volume: 0.8 }); // Mi5
    beep({ freq: 494, duration: 0.24, delay: 0.26, type: 'triangle', volume: 0.85 }); // Si4
  });
}

// XÁC NHẬN THAO TÁC — 1 tiếng "cạch" ngắn, gọn, cho chính người vừa bấm
// Duyệt/Từ chối nghe thấy ngay hành động của mình đã được ghi nhận. Không
// lặp, không dùng playOnce (đây là phản hồi trực tiếp cho 1 cú bấm, không
// phải sự kiện realtime có thể tới trùng qua 2 đường).
export function playConfirmSound() {
  withRunningCtx(() => {
    beep({ freq: 988, duration: 0.09, type: 'triangle', volume: 0.8 });
  });
}
