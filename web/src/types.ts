export enum LoyaltyTier {
  BRONZE = "Bronze",
  SILVER = "Silver",
  GOLD = "Gold",
  PLATINUM = "Platinum"
}

export interface Purchase {
  id: string;
  item: string;
  category: string;
  amount: number;
  date: string;
}

export interface Customer {
  id: string;
  name: string;
  avatar: string;
  tier: LoyaltyTier;
  points: number;
  recentPurchases: Purchase[];
  persona: string; // Description for internal context
}

export interface Reward {
  title: string;
  description: string;
  reason: string;
}

export interface NextBestOffer {
  title: string;
  description: string;
  reason: string;
}

export interface CustomerLoyaltyJourney {
  customerName: string;
  tier: LoyaltyTier;
  points: number;
  nextStepText: string;
  friendlyMessage: string;
  nextBestOffer: NextBestOffer;
  rewards: Reward[];
  generatedAt: string;
}

export interface StandardRewardPlan {
  tier: LoyaltyTier;
  nextStepText: string;
  message: string;
  nextBestOffer: {
    title: string;
    description: string;
  };
  rewards: Array<{
    title: string;
    description: string;
    standardPolicy: string; // e.g. "Standard Silver Tier Policy Benefit"
  }>;
}
