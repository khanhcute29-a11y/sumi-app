# Issue tracker: Local Markdown

Issues và spec cho sumi-app lưu dạng file markdown trong `.scratch/` — dự án này
không dùng GitHub Issues (dù repo có remote GitHub thật), vì công việc thực tế
được nhận trực tiếp qua chat (Zalo/Messenger) với chủ tiệm, không qua ticket.

## Quy ước

- Mỗi tính năng một thư mục: `.scratch/<ten-tinh-nang>/`
- Spec nằm ở `.scratch/<ten-tinh-nang>/spec.md`
- Mỗi việc triển khai là 1 file riêng tại `.scratch/<ten-tinh-nang>/issues/<NN>-<slug>.md`,
  đánh số từ `01`, không gộp chung 1 file
- Trạng thái triage ghi ở dòng `Status:` gần đầu mỗi file issue
- Bình luận/lịch sử trao đổi thêm vào cuối file dưới heading `## Comments`

## Khi một skill nói "publish lên issue tracker"

Tạo file mới trong `.scratch/<ten-tinh-nang>/` (tạo thư mục nếu chưa có).

## Khi một skill nói "lấy đúng ticket liên quan"

Đọc file tại đường dẫn được nhắc tới. Người dùng thường đưa thẳng đường dẫn hoặc
số issue.

## Wayfinding (dùng bởi `/wayfinder`)

**Map** là 1 file có nhiều file **con** — mỗi file con là 1 ticket.

- **Map**: `.scratch/<effort>/map.md`
- **Ticket con**: `.scratch/<effort>/issues/NN-<slug>.md`, đánh số từ `01`, có
  dòng `Type:` (`research`/`prototype`/`grilling`/`task`) và `Status:`
  (`claimed`/`resolved`)
- **Blocking**: dòng `Blocked by: NN, NN` gần đầu file — ticket hết bị chặn khi
  mọi file trong danh sách đó đã `resolved`
- **Frontier**: quét `.scratch/<effort>/issues/` tìm file đang mở, không bị
  chặn, chưa ai nhận — số nhỏ nhất được ưu tiên
- **Claim**: set `Status: claimed` rồi lưu trước khi làm
- **Resolve**: thêm câu trả lời dưới heading `## Answer`, set `Status: resolved`,
  rồi thêm 1 dòng tham chiếu ngắn vào phần Decisions-so-far của `map.md`
