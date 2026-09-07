export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string;
  qty: number;
};

export type CartState = {
  lines: CartLine[];
};
