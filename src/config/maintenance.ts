// Exact withdrawal endpoints only: no prefix matching or general account bypass.
export function allowedDuringMaintenance(rawUrl: string) {
  const path = rawUrl.split('?')[0];
  // Owners with an expired session must be able to sign in to withdraw consent.
  return /^\/api\/auth\/(?:sign-in\/email|sign-out)$/.test(path)
    || /^\/api\/journeys\/(?:current\/share\/revoke|sharing\/(?:revoke|location\/revoke))$/.test(path)
    || /^\/api\/journeys\/current\/(?:check-ins|arrive|complete|emergency(?:\/[^/]+)?)$/.test(path);
}
