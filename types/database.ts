export type MemberRole = "owner" | "partner";
export type ItemStatus = "needed" | "bought";
export type ItemCategory =
  | "vegetables"
  | "meat"
  | "supermarket"
  | "pharmacy"
  | "coffee"
  | "other";

export type ProfileRow = {
  id: string;
  name: string;
  created_at: string;
};

export type HomeRow = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type HomeMemberRow = {
  home_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type ItemRow = {
  id: string;
  home_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: ItemCategory;
  notes: string | null;
  status: ItemStatus;
  added_by: string;
  bought_by: string | null;
  created_at: string;
  bought_at: string | null;
};
