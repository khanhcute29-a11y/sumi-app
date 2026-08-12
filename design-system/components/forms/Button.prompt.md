Primary action button family for the ops app — used for "TẠO ĐƠN MỚI", "Xác nhận Thanh toán", "Chuyển Bếp & In Tem", and destructive actions like "Emergency Stop".

```jsx
<Button variant="primary" size="md">Xác nhận Thanh toán</Button>
<Button variant="secondary">Hủy Đơn</Button>
<Button variant="danger" icon="⛔">Emergency Stop</Button>
```

Variants: `primary` (Buttery Yellow #C88A4B fill — the one main action per screen), `secondary` (outlined, low-emphasis), `ghost` (no border, for toolbar/inline actions), `danger` (red, for Emergency Stop / Hủy Đơn). Sizes: `sm`, `md`, `lg`. Pass `disabled` to gray it out — never remove it from layout.
