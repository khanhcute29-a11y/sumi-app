// Xuất file Excel thật (.xlsx) có định dạng — exceljs nạp ĐỘNG (dynamic import)
// nên chỉ tải khi bấm xuất, không làm nặng bundle chính của app.
//
// sheet = { name, headers, rows, bandCol?, totalRow? }
//  - Cột có tiêu đề chứa "(đ)" → định dạng tiền #,##0
//  - Cột đếm (Số đơn / Số lượng…) → căn giữa, số nguyên
//  - bandCol: kẻ đường đậm hơn mỗi khi giá trị cột này đổi (tách nhóm ngày/tuần,
//    KHÔNG tô nền xen kẽ — nền chỗ có chỗ không gây rối mắt)
//  - centerNumbers: ô số căn giữa, định dạng #,##0.## (bảng KPI, nhiều cột số không có "(đ)")
//  - groups: [{ label, from, to, color }] — hàng nhãn nhóm cột (gộp ô, tô màu riêng) phía trên tiêu đề
//  - freezeCols: số cột đầu cố định khi cuộn ngang (VD tên nhân viên)
//  - totalRows: số dòng CUỐI là dòng TỔNG (in đậm + tô nền vàng nhạt)
// Kiểu dòng cho bảng dạng KHỐI (mỗi đơn 1 khối): order = dòng thông tin đơn,
// item = dòng sản phẩm, cancelled = đơn huỷ (gạch mờ), section = tiêu đề luồng,
// flow = tổng luồng, grand = tổng cộng.
const FILLS = { order: 'FFE7F5EC', section: 'FF15803D', flow: 'FFFEF3C7', grand: 'FFFDE68A', cancelled: 'FFF3F4F6' };
function styleBlocks(ws, sh, moneyCols, countCols) {
  const MID = { style: 'medium', color: { argb: 'FF15803D' } };
  sh.rowStyles.forEach((kind, i) => {
    const row = ws.getRow(i + 2);
    const startsBlock = kind === 'order' || kind === 'cancelled' || kind === 'flow' || kind === 'grand' || kind === 'section';
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = { top: startsBlock ? MID : BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      c.alignment = { vertical: 'top', wrapText: true, horizontal: moneyCols[col - 1] ? 'right' : countCols[col - 1] ? 'center' : 'left' };
      if (moneyCols[col - 1] || countCols[col - 1]) c.numFmt = '#,##0';
      if (sh.centerNumbers && typeof c.value === 'number') { c.alignment = { ...c.alignment, horizontal: 'center' }; c.numFmt = Number.isInteger(c.value) ? '#,##0' : '#,##0.##'; }
      if (FILLS[kind]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILLS[kind] } };
      if (kind === 'order') c.font = { bold: true };
      if (kind === 'flow' || kind === 'grand') c.font = { bold: true };
      if (kind === 'section') c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      if (kind === 'cancelled') c.font = { italic: true, strike: true, color: { argb: 'FF9CA3AF' } };
    });
  });
}

const BORDER = { style: 'thin', color: { argb: 'FFEADCCA' } };

export async function downloadXlsx(filename, sheets) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  sheets.forEach((sh) => {
    const ws = wb.addWorksheet(sh.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: sh.groups ? 2 : 1, xSplit: sh.freezeCols || 0 }] });
    if (sh.groups) ws.addRow(Array(sh.headers.length).fill(''));
    ws.addRow(sh.headers);
    sh.rows.forEach((r) => ws.addRow(r));
    const HEAD = sh.groups ? 2 : 1; // số dòng tiêu đề phía trên dữ liệu

    const moneyCols = sh.headers.map((h) => /\(đ\)/.test(h));
    const countCols = sh.headers.map((h, i) => !moneyCols[i] && /^(số|tổng số)|số đơn|số lượng/i.test(h));

    // Độ rộng cột: theo chữ dài nhất, chặn trên để cột "Sản phẩm" không tràn.
    sh.headers.forEach((h, i) => {
      const longest = Math.max(h.length, ...sh.rows.map((r) => String(r[i] ?? '').length));
      const isText = !moneyCols[i] && !countCols[i] && longest > 40;
      ws.getColumn(i + 1).width = isText ? 60 : Math.min(Math.max(longest + 2, 12), moneyCols[i] ? 20 : 34);
    });

    if (sh.groups) {
      sh.groups.forEach((g) => {
        if (g.to > g.from) ws.mergeCells(1, g.from + 1, 1, g.to + 1);
        const c = ws.getCell(1, g.from + 1);
        c.value = g.label;
        for (let col = g.from + 1; col <= g.to + 1; col += 1) {
          const cc = ws.getCell(1, col);
          cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.color } };
          cc.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        }
        c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      ws.getRow(1).height = 26;
    }
    const head = ws.getRow(HEAD);
    head.height = 44;
    head.eachCell((c, col) => {
      const grp = sh.groups && sh.groups.find((g) => col - 1 >= g.from && col - 1 <= g.to);
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grp ? grp.color : 'FF15803D' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    });

    const MID = { style: 'medium', color: { argb: 'FF15803D' } };
    if (sh.rowStyles) { styleBlocks(ws, sh, moneyCols, countCols); return; }
    let prev = null;
    for (let r = HEAD + 1; r <= ws.rowCount; r += 1) {
      const row = ws.getRow(r);
      const isTotal = r > ws.rowCount - (sh.totalRows || 0);
      let groupStart = false;
      if (sh.bandCol !== undefined && !isTotal) {
        const v = row.getCell(sh.bandCol + 1).value;
        groupStart = prev !== null && v !== prev;
        prev = v;
      }
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = { top: groupStart || (isTotal && r === ws.rowCount - sh.totalRows + 1) ? MID : BORDER, bottom: BORDER, left: BORDER, right: BORDER };
        c.alignment = { vertical: 'top', wrapText: true, horizontal: moneyCols[col - 1] ? 'right' : countCols[col - 1] ? 'center' : 'left' };
        if (moneyCols[col - 1]) c.numFmt = '#,##0';
        else if (countCols[col - 1]) c.numFmt = '#,##0';
        if (sh.centerNumbers && typeof c.value === 'number' && !moneyCols[col - 1]) { c.alignment = { ...c.alignment, horizontal: 'center' }; c.numFmt = Number.isInteger(c.value) ? '#,##0' : '#,##0.##'; }
        if (isTotal) {
          c.font = { bold: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        }
      });
    }
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
