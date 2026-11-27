# Security Specification — MullahMax Auth & Multi-Profile Firestore

## 1. Data Invariants
1. A `UserAccount` at `/users/{userId}` may only be created, read, or updated by the verified authenticated user whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. A `ViewerProfile` at `/users/{userId}/profiles/{profileId}` belongs strictly to the parent `UserAccount` (`/users/{userId}`), with `ownerId == userId == request.auth.uid`.
3. Path variables (`userId`, `profileId`) must match `^[a-zA-Z0-9_\-]+$` and stay within `128` characters.
4. Immutable identity and temporal fields (`uid`, `ownerId`, `id`, `createdAt`) cannot be altered after creation.
5. `createdAt` and `updatedAt` must equal server `request.time`.
6. Unbounded arrays are prohibited: `favoriteGenres <= 20`, `preferredPlatforms <= 15`, `watchlist <= 500`, `liked <= 500`, `disliked <= 500`, `watchHistory <= 200`.
7. Blanket `list` queries on `/users` are denied; `list` on `/users/{userId}/profiles` enforces `resource.data.ownerId == request.auth.uid`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. **Identity Spoofing on Account Create**: Creating `/users/victimUid` while authenticated as `attackerUid` (`uid: "victimUid"`). Expected: `PERMISSION_DENIED`.
2. **Email Spoofing (Unverified)**: Authenticated with `email_verified: false` reading or writing `/users/{uid}`. Expected: `PERMISSION_DENIED`.
3. **Ghost / Shadow Field Injection**: Creating `/users/{uid}` with extra field `isAdmin: true`. Expected: `PERMISSION_DENIED` (`hasOnly` rejects).
4. **Orphan Profile Create**: Creating `/users/{uid}/profiles/p1` without parent `/users/{uid}` existing (or in same batch). Expected: `PERMISSION_DENIED`.
5. **Cross-Owner Profile Hijack**: Creating `/users/{uid}/profiles/p1` with `ownerId: "otherUid"`. Expected: `PERMISSION_DENIED`.
6. **ID Poisoning**: Creating `/users/{uid}/profiles/a..b..c` or a 300-char `profileId`. Expected: `PERMISSION_DENIED`.
7. **Immutable Field Mutation**: Updating `createdAt` or `ownerId` on an existing profile. Expected: `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: Creating a profile with `createdAt` set to a fake past client timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
9. **Array Exhaustion (Denial of Wallet)**: Pushing 501 items into `watchlist` or 21 items into `favoriteGenres`. Expected: `PERMISSION_DENIED`.
10. **PII Blanket Read**: Reading `/users/{victimUid}` as another signed-in verified user. Expected: `PERMISSION_DENIED`.
11. **Unscoped List Query**: Listing `/users` or `/users/{victimUid}/profiles` without owner match. Expected: `PERMISSION_DENIED`.
12. **Type Poisoning**: Updating `name` to a number `12345` or string > 50 chars. Expected: `PERMISSION_DENIED`.
