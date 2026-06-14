import { LoyaltyTier, StandardRewardPlan } from "./types";

// Customers now come live from the NVIDIA backend (see src/api.ts -> /customers).
// Only the uniform, non-personalized tier baseline lives here; it backs the
// "Standard" comparison column and the consent-off view.
export const STANDARD_TIER_OFFERS: Record<LoyaltyTier, Omit<StandardRewardPlan, "tier">> = {
  [LoyaltyTier.BRONZE]: {
    nextStepText: "Earn more points to unlock Silver Tier rewards",
    message: "Thanks for being a loyalty member! Enjoy 5% off your next purchase and earn points on every order.",
    nextBestOffer: {
      title: "Enjoy 5% off your next purchase and earn points on every order.",
      description: "The standard welcome offer available to every member.",
    },
    rewards: [
      {
        title: "Standard 1x Points Earning",
        description: "Earn 1 Loyalty Point for every unit spent across the catalog.",
        standardPolicy: "Uniform Bronze Loyalty Benefit",
      },
      {
        title: "General Newsletter",
        description: "Monthly promotions, product updates, and standard holiday coupons.",
        standardPolicy: "Uniform Bronze Loyalty Benefit",
      },
    ],
  },
  [LoyaltyTier.SILVER]: {
    nextStepText: "Earn more points to unlock Gold Tier rewards",
    message: "Thanks for being a loyalty member! Enjoy 5% off your next purchase and earn points on every order.",
    nextBestOffer: {
      title: "Enjoy 5% off your next purchase and earn points on every order.",
      description: "The standard welcome offer available to every member.",
    },
    rewards: [
      {
        title: "Free Standard Shipping over threshold",
        description: "Complimentary ground delivery on qualifying orders.",
        standardPolicy: "Uniform Silver Loyalty Benefit",
      },
      {
        title: "1.1x Points Multiplier",
        description: "A 10% bonus on all points generated through digital purchases.",
        standardPolicy: "Uniform Silver Loyalty Benefit",
      },
      {
        title: "Monthly Deals Catalog",
        description: "The general Silver promotional list with uniform seasonal discounts.",
        standardPolicy: "Uniform Silver Loyalty Benefit",
      },
    ],
  },
  [LoyaltyTier.GOLD]: {
    nextStepText: "Earn more points to reach Platinum Tier",
    message: "Thanks for being a loyalty member! Enjoy 5% off your next purchase and earn points on every order.",
    nextBestOffer: {
      title: "Enjoy 5% off your next purchase and earn points on every order.",
      description: "The standard welcome offer available to every member.",
    },
    rewards: [
      {
        title: "Free Standard Shipping on all orders",
        description: "Free flat-rate economy shipping with no minimum spend.",
        standardPolicy: "Uniform Gold Loyalty Benefit",
      },
      {
        title: "1.25x Points Multiplier",
        description: "A 25% points boost on every unit spent.",
        standardPolicy: "Uniform Gold Loyalty Benefit",
      },
      {
        title: "Priority Support Queue",
        description: "Accelerated support line with faster response times.",
        standardPolicy: "Uniform Gold Loyalty Benefit",
      },
    ],
  },
  [LoyaltyTier.PLATINUM]: {
    nextStepText: "You are at the highest tier — enjoy the full benefits.",
    message: "Thanks for being a loyalty member! Enjoy 5% off your next purchase and earn points on every order.",
    nextBestOffer: {
      title: "Enjoy 5% off your next purchase and earn points on every order.",
      description: "The standard welcome offer available to every member.",
    },
    rewards: [
      {
        title: "Free Priority Shipping on all orders",
        description: "Upgraded priority shipping on every transaction with no minimum.",
        standardPolicy: "Uniform Platinum Loyalty Benefit",
      },
      {
        title: "1.5x Points Multiplier",
        description: "A 50% extra points bonus on all eligible transactions.",
        standardPolicy: "Uniform Platinum Loyalty Benefit",
      },
      {
        title: "Dedicated Concierge Support",
        description: "Exclusive priority helpline and high-priority live agent chat.",
        standardPolicy: "Uniform Platinum Loyalty Benefit",
      },
    ],
  },
};
