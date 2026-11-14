# Security Specifications - Vrtx Fitness

## Data Invariants
1. A workout or nutrition log cannot exist without a valid owner ID matching the logged-in user.
2. User profiles can only be created/updated by the owner.
3. Workout logs can be read by others if `shared` is true, otherwise only by the owner.
4. Timestamps are server-validated.

## Dirty Dozen Payloads (Rejection Tests)
1. **Identity Spoofing**: Creating a workout with `userId: "other_user"`.
2. **PII Leak**: Reading another user's private `email` field (if not the owner).
3. **Ghost Fields**: Adding `isAdmin: true` to a user profile.
4. **ID Poisoning**: Using a 1MB string as a document ID.
5. **State Shortcut**: Changing `createdAt` after creation.
6. **Value Poisoning**: Sending a string for `calories` instead of a number.
7. **Relational Sync**: Listing all workouts without filtering by owner or sharing status.
8. **Denial of Wallet**: Sending a massive array of 10,000 "empty" exercises.
9. **Unverified Auth**: Writing data with an unverified email (if enforced).
10. **Shadow Update**: Updating a workout's `userId` after creation.
11. **Regex Bypass**: Using special characters in IDs that are forbidden.
12. **Blanket Read**: Fetching the entire `users` collection without a specific ID.

## Firestore Rules Logic (DRAFT)
The following rules enforce strict schema validation, owner-only writes, and privacy for logs.
