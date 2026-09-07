export type Review = {
  id: string;
  productId: string;
  customerDisplayName: string;
  rating: number;
  reviewText: string;
  imageUrl: string | null;
  source: string;
  isFeatured: boolean;
  sortOrder: number;
};
