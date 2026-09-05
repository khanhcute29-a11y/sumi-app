# Domain Docs

Cách các skill nên đọc tài liệu nghiệp vụ của sumi-app trước khi khám phá code.

## Trước khi khám phá, đọc các file sau (nếu đã có)

- **`CONTEXT.md`** ở gốc repo
- **`docs/adr/`**: đọc các ADR chạm tới vùng sắp làm

Nếu các file này chưa tồn tại, **cứ tiếp tục im lặng** — không cần báo là thiếu,
không cần đề xuất tạo trước. Skill `/domain-modeling` (được gọi qua
`/grill-with-docs` hoặc `/improve-codebase-architecture`) sẽ tạo dần các file
này khi có thuật ngữ/quyết định thực sự cần ghi lại.

## Cấu trúc thư mục

Repo single-context (đúng với sumi-app — không phải monorepo):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-...md
│   └── 0002-...md
└── src/
```

## Dùng đúng thuật ngữ trong CONTEXT.md

Khi output nhắc tới 1 khái niệm nghiệp vụ (tiêu đề issue, đề xuất refactor, tên
test...), dùng đúng từ đã định nghĩa trong `CONTEXT.md`. Không tự chế từ đồng
nghĩa mà glossary đã tránh dùng.

Nếu khái niệm cần dùng chưa có trong glossary, đó là tín hiệu: hoặc đang tự bịa
ra ngôn ngữ dự án không dùng (nên xem lại), hoặc đây là khoảng trống thật (ghi
chú lại cho `/domain-modeling`).

## Báo xung đột với ADR

Nếu output mâu thuẫn với 1 ADR đã có, nêu rõ ra thay vì âm thầm ghi đè:

> _Mâu thuẫn với ADR-0007 (...), nhưng đáng để mở lại vì..._
