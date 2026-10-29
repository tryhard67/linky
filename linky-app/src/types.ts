export interface Doujin {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  nhurl: string;
  field: string;
  thumb: string;
  user: string;
  code: number;
  category: string;
  isFavorite: boolean;
  isAnimated: boolean | undefined;
}
