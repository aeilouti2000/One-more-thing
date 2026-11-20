import type { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { TranslationKey } from "@/constants/i18n";

/**
 * Release notes for the installed version, shown on About → What's new.
 * Replace them (and their text in constants/i18n.ts) with each release.
 */
export const WHATS_NEW: TranslationKey[] = [
  "whatsNew1",
  "whatsNew2",
  "whatsNew3",
  "whatsNew4",
  "whatsNew5",
];

export type AppFeature = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Drawn instead of `icon`, for symbols from the other icon set (the pin). */
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: TranslationKey;
  body: TranslationKey;
  /** App version the feature arrived in; it's tagged "New" while that version is installed. */
  since?: string;
};

export type AppFeatureGroup = {
  id: string;
  title: TranslationKey;
  features: AppFeature[];
};

/**
 * The app's main features, shown on About → App features. When a big feature
 * ships, add it here with `since` set to that version, and add its title and
 * body to constants/i18n.ts in English and Arabic.
 */
export const APP_FEATURES: AppFeatureGroup[] = [
  {
    id: "together",
    title: "featureGroupTogether",
    features: [
      { id: "shared", icon: "people-outline", title: "featureSharedTitle", body: "featureSharedBody" },
      { id: "trips", icon: "cart-outline", title: "featureTripsTitle", body: "featureTripsBody" },
      { id: "urgent", icon: "flame-outline", title: "featureUrgentTitle", body: "featureUrgentBody" },
      {
        id: "notifications",
        icon: "notifications-outline",
        title: "featureNotificationsTitle",
        body: "featureNotificationsBody",
      },
      {
        id: "ask",
        icon: "chatbubbles-outline",
        title: "featureAskTitle",
        body: "featureAskBody",
        since: "2.9.1",
      },
      { id: "share", icon: "share-outline", title: "featureShareTitle", body: "featureShareBody" },
    ],
  },
  {
    id: "organised",
    title: "featureGroupOrganised",
    features: [
      { id: "lists", icon: "albums-outline", title: "featureListsTitle", body: "featureListsBody" },
      {
        id: "categories",
        icon: "pricetags-outline",
        title: "featureCategoriesTitle",
        body: "featureCategoriesBody",
      },
      {
        id: "pins",
        icon: "pin-outline",
        communityIcon: "pin-outline",
        title: "featurePinsTitle",
        body: "featurePinsBody",
      },
      {
        id: "sets",
        icon: "albums-outline",
        communityIcon: "card-multiple-outline",
        title: "featureSetsTitle",
        body: "featureSetsBody",
        since: "2.9.1",
      },
      {
        id: "later",
        icon: "hourglass-outline",
        title: "featureLaterTitle",
        body: "featureLaterBody",
        since: "2.9.1",
      },
      {
        id: "widgets",
        icon: "grid-outline",
        title: "featureWidgetsTitle",
        body: "featureWidgetsBody",
        since: "2.9.2",
      },
      { id: "quick", icon: "flash-outline", title: "featureQuickTitle", body: "featureQuickBody" },
      { id: "photos", icon: "image-outline", title: "featurePhotosTitle", body: "featurePhotosBody" },
      { id: "history", icon: "time-outline", title: "featureHistoryTitle", body: "featureHistoryBody" },
    ],
  },
  {
    id: "spending",
    title: "featureGroupSpending",
    features: [
      {
        id: "prices",
        icon: "cash-outline",
        title: "featurePricesTitle",
        body: "featurePricesBody",
        since: "2.9.0",
      },
      { id: "receipt", icon: "scan-outline", title: "featureReceiptTitle", body: "featureReceiptBody" },
      {
        id: "invoices",
        icon: "receipt-outline",
        title: "featureInvoicesTitle",
        body: "featureInvoicesBody",
      },
      { id: "budget", icon: "pie-chart-outline", title: "featureBudgetTitle", body: "featureBudgetBody" },
      {
        id: "tripTotal",
        icon: "calculator-outline",
        title: "featureTripTotalTitle",
        body: "featureTripTotalBody",
        since: "2.9.1",
      },
      {
        id: "recap",
        icon: "sparkles-outline",
        title: "featureRecapTitle",
        body: "featureRecapBody",
        since: "2.9.1",
      },
      { id: "export", icon: "download-outline", title: "featureExportTitle", body: "featureExportBody" },
    ],
  },
  {
    id: "yours",
    title: "featureGroupYours",
    features: [
      {
        id: "offline",
        icon: "cloud-offline-outline",
        title: "featureOfflineTitle",
        body: "featureOfflineBody",
      },
      { id: "language", icon: "language-outline", title: "featureLanguageTitle", body: "featureLanguageBody" },
      { id: "look", icon: "moon-outline", title: "featureLookTitle", body: "featureLookBody" },
      {
        id: "icon",
        icon: "apps-outline",
        title: "featureIconTitle",
        body: "featureIconBody",
        since: "2.9.1",
      },
      {
        id: "swipe",
        icon: "swap-horizontal-outline",
        title: "featureSwipeTitle",
        body: "featureSwipeBody",
      },
      { id: "signin", icon: "key-outline", title: "featureSignInTitle", body: "featureSignInBody" },
    ],
  },
];
