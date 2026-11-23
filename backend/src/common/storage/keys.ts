/** Storage keys, built from ids. Everything of one home sits under one prefix. */
export const photoKey = (homeId: string, imageId: string, size: "full" | "thumb") =>
  `homes/${homeId}/photos/${imageId}/${size}.jpg`;

export const iconKey = (homeId: string, imageId: string) => `homes/${homeId}/icons/${imageId}.webp`;
