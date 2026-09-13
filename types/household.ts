export type HouseholdMember = {
  id: string;
  name: string;
  role: "owner" | "partner";
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
};
