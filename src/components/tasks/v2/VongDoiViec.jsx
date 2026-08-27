import React from 'react';
import { buocVongDoi } from '../../../lib/congViec';

// Dải 6 bước vòng đời một việc — đúng thiết kế mockup
// (task-lifecycle-v2-approved.html, khối `.lifecycle`).
//
// CHỈ HIỂN THỊ, không tự suy trạng thái ở đây — `buocVongDoi()` trong
// congViec.js đã làm việc đó, dùng chung cho mọi màn hình để không lệch nhau.
export default function VongDoiViec({ viec }) {
  const buoc = buocVongDoi(viec);
  return (
    <div className="cv-vongdoi" aria-label="Vòng đời công việc">
      {buoc.map((b, i) => (
        <div key={b.nhan} className={`cv-buoc cv-buoc-${b.trang_thai}`}>
          <b>{i + 1}</b>
          {b.nhan}
          {b.gio && <time>{b.gio}</time>}
        </div>
      ))}
    </div>
  );
}
