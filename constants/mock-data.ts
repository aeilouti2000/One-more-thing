import type { Household } from "@/types/household";
import type { Purchase } from "@/types/purchase";

export const MOCK_HOUSEHOLD: Household = {
  id: "hh_1",
  name: "Our place",
  inviteCode: "OMT-4821",
  members: [
    { id: "u_1", name: "Alex", role: "owner" },
    { id: "u_2", name: "Sam", role: "partner" },
  ],
};

export const MOCK_PURCHASES: Purchase[] = [
  {
    id: "p_1",
    name: "Oat milk",
    quantity: 2,
    unit: "cartons",
    category: "market",
    notes: "Barista version if they have it",
    status: "needed",
    addedByName: "Sam",
    createdAt: "2026-09-12T09:00:00.000Z",
  },
  {
    id: "p_2",
    name: "Laundry detergent",
    quantity: 1,
    category: "household",
    status: "needed",
    addedByName: "Alex",
    createdAt: "2026-09-11T18:20:00.000Z",
  },
  {
    id: "p_3",
    name: "Toothpaste",
    quantity: 1,
    category: "personal",
    status: "needed",
    addedByName: "Alex",
    createdAt: "2026-09-10T12:00:00.000Z",
  },
  {
    id: "p_4",
    name: "Coffee beans",
    quantity: 1,
    unit: "bag",
    category: "market",
    status: "bought",
    addedByName: "Sam",
    boughtByName: "Alex",
    createdAt: "2026-09-08T08:00:00.000Z",
    boughtAt: "2026-09-09T17:40:00.000Z",
  },
  {
    id: "p_5",
    name: "Paper towels",
    quantity: 1,
    category: "household",
    status: "bought",
    addedByName: "Alex",
    boughtByName: "Sam",
    createdAt: "2026-09-07T10:00:00.000Z",
    boughtAt: "2026-09-07T16:15:00.000Z",
  },
];
