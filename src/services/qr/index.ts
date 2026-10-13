export type QrPayload = {
  hotelId: string;
  token: string;
};

export async function verifyQrToken(_payload: QrPayload): Promise<never> {
  throw new Error("qrService.verifyQrToken is not implemented yet (Achievements phase).");
}
