export const ORDER_FLOWS = [
  { key: 'cake', icon: '🎂', title: 'Bánh kem & bánh lạnh', subtitle: 'Bánh kem, Mousse, Tiramisu, su kem…' },
  { key: 'bakery', icon: '🥐', title: 'Bánh mặn/ngọt & bánh khác', subtitle: 'Trung Thu, bánh pía, bánh quy, bánh mới…' },
  { key: 'teabreak', icon: '🧁', title: 'Teabreak', subtitle: 'Tiệc từ vài chục đến 1.500 khách' },
  { key: 'macaron', icon: '🌈', title: 'Macaron', subtitle: 'Có nhân, vỏ trang trí, đóng hộp' },
  { key: 'school', icon: '🏫', title: 'Trường học', subtitle: 'Chọn trường, điểm giao, số lượng' },
];

export const CAKE_LINES = [
  { key: 'decorated_cake', label: '🎂 Bánh kem', note: 'Bánh sinh nhật, bánh trang trí theo mẫu' },
  { key: 'cold_cake', label: '❄️ Bánh lạnh', note: 'Mousse, Tiramisu, su kem và món cần giữ lạnh' },
];

const rawTeabreak = [
  ['SM01','Sandcheese kẹp','20g/cái','Mặn'],['SM02','Hotdog xúc xích cheese','20g/cái','Mặn'],
  ['SM03','Bánh mì xúc xích chà bông mini','20g/cái','Mặn'],['SM04','Hamburger bò mini','20g/cái','Mặn'],
  ['SM05','Bánh mì phô mai tỏi Hàn Quốc mini','20g/cái','Mặn'],['SM06','Bánh mì chà bông trứng muối','20g/cái','Mặn'],
  ['SM07','Bánh mì phô mai tan chảy mini','20g/cái','Mặn'],['SM08','Bánh mì rau củ mini','20g/cái','Mặn'],
  ['SM09','Bánh mì ham cheese phô mai','20g/cái','Mặn'],['SM10','Bánh mì phô mai tan chảy dài','20g/cái','Mặn'],
  ['SM11','Bánh mì phô mai hoàng kim','20g/cái','Mặn'],['SM12','Bánh mì tan chảy chà bông rong biển','20g/cái','Mặn'],
  ['SM13','Bánh mì chà bông sốt mini','20g/cái','Mặn'],['SM14','Bánh mì xúc xích chà bông mini','20g/cái','Mặn'],
  ['SM15','Bánh mì rau củ chà bông','20g/cái','Mặn'],['SM16','Bánh mì ốc kem','25g/cái','Ngọt'],
  ['SM17','Donut socola','20g/cái','Ngọt'],['SM18','Bánh mì phô mai bơ sữa','20g/cái','Ngọt'],
  ['SM19','Cream cheese','20g/cái','Ngọt'],['SM20','Custard nhân kem','25g/cái','Ngọt'],
  ['SM21','Paparoti socola','20g/cái','Ngọt'],['SM22','Donut sắc màu','20g/cái','Ngọt'],
  ['SM23','Donut socola vòng','20g/cái','Ngọt'],['SM24','Pate Chaud','25g/cái','Mặn'],
  ['SM25','Ngàn lớp xúc xích','25g/cái','Mặn'],['SM26','Bánh bao nướng','45g/cái','Mặn'],
  ['SM27','Croissant','20g/cái','Ngọt'],['SM28','Croissant thịt nguội','30g/cái','Mặn'],
  ['SM29','Su que','20g/cái','Ngọt'],['SM30','Su kem tròn','25g/cái','Ngọt'],
  ['SM31','Su kem matcha','20g/cái','Ngọt'],['SM32','Su kem socola','20g/cái','Ngọt'],
  ['SM33','Su Singapore không trang trí','20g/cái','Ngọt'],['SM34','Su kem vỏ giòn','20g/cái','Ngọt'],
  ['SM35','Su Singapore trái cây','30g/cái','Ngọt'],['SM36','Bông lan cuộn khóm','20g/cái','Ngọt'],
  ['SM37','Bông lan cuộn kem','20g/cái','Ngọt'],['SM38','Bông lan cuộn chocolate','20g/cái','Ngọt'],
  ['SM39','Bông lan cuộn chà bông trứng muối','20g/cái','Mặn/ngọt'],['SM40','Cupcake kem','20g/cái','Ngọt'],
  ['SM41','Cup bông lan phô mai trứng muối','20g/cái','Mặn/ngọt'],['SM42','Bông lan chà bông trứng muối vuông','4cm/cái','Mặn/ngọt'],
  ['SM43','Bông lan chà bông rong biển','4cm/cái','Mặn/ngọt'],['SM44','Cake việt quất','25g/miếng','Ngọt'],
  ['SM45','Muffin walnut','25g/cái','Ngọt'],['SM46','Muffin ham cheese','25g/cái','Mặn'],
  ['SM47','Bông lan chocolate','20g/cái','Ngọt'],['SM48','Mini tart trứng','3cm/cái','Ngọt'],
  ['SM49','Tart trứng','5cm/cái','Ngọt'],['SM50','Tart dâu','5cm/cái','Ngọt'],
  ['SM51','Tart xoài dâu','20g/cái','Ngọt'],['SM52','Tiramisu vuông','4cm/cái','Ngọt'],
  ['SM53','Mousse chanh dây','4cm/miếng','Ngọt'],['SM54','Panna cotta chanh dây/dâu/việt quất/kiwi','30g/ly tròn','Món ly'],
  ['SM55','Bánh bò thốt nốt','4cm/ly giấy','Ngọt'],['SM56','Bánh chuối hạnh nhân','4cm/ly giấy','Ngọt'],
  ['SM57','Bánh dứa Đài Loan','30g/cái','Ngọt'],['SM58','Bánh da lợn','35g/cái','Ngọt'],
  ['SM59','Rau câu lá dứa/cà phê','cái','Món ly'],['SM60','Sữa chua','60g/hũ','Món ly'],
  ['SM61','Flan','60g/cái','Món ly'],['SM62','Ngàn lớp cuộn nho','20g/cái','Ngọt'],
  ['SM63','Ngàn lớp chocolate','20g/cái','Ngọt'],['SM64','Croissant kim sa','20g/cái','Ngọt'],
  ['SM65','Croissant nhân chủ đề','20g/cái','Ngọt'],['SM66','Croissant xanh/đỏ','20g/cái','Ngọt'],
];

export const TEABREAK_CATALOG = rawTeabreak.map(([code, name, specification, group]) => ({
  code, name, specification, group,
}));

export const normalizeSearch = (value='') => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
