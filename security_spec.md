# Security Specification & TDD Plan — MM-MICROFINANCE

## 1. Data Invariants
1. **Strict Ownership & Verified Identity**: No unauthenticated or unverified user (`email_verified != true`) may read, list, create, update, or delete any document in `companySettings`, `loanTypes`, `customers`, `loans`, `repayments`, or `messageLogs`.
2. **PII Isolation**: `customers`, `loans`, `repayments`, and `messageLogs` contain borrower PII (`phone`, `idNumber`, `street`, `witnessPhone`). `allow get` and `allow list` strictly require `resource.data.ownerId == request.auth.uid || isAdmin()`.
3. **Referential Integrity**: A `Loan` cannot be created unless its `customerId` references an existing document in `/customers/{customerId}` owned by the same user (`ownerId == request.auth.uid` or admin). A `Repayment` cannot be created unless both `loanId` (`/loans/{loanId}`) and `customerId` (`/customers/{customerId}`) exist. A `MessageLog` requires an existing `/customers/{customerId}`.
4. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` can never be changed on `update`. `createdAt` on `create` and `updatedAt` on `create`/`update` must equal `request.time`.
5. **Terminal State Locking**: Once a `Loan` has `status == 'completed'`, non-admin updates are blocked.
6. **Path ID & Size Hardening**: All document IDs must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars. All string fields enforce explicit `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/List**: `request.auth == null` attempting `get` or `list` on `/customers`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: `request.auth.token.email == 'kennethmhaiki@gmail.com'` with `email_verified: false`. Expected: `PERMISSION_DENIED`.
3. **Cross-Tenant PII Theft**: Authenticated user B (`uid: "attacker"`) attempting `get` or `list` on customer owned by user A (`ownerId: "userA"`). Expected: `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: User B attempting to create a customer with `ownerId: "userA"`. Expected: `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Creating a customer with extra field `isAdmin: true` or `creditScore: 999`. Expected: `PERMISSION_DENIED`.
6. **Orphan Loan Creation**: Creating a loan referencing a non-existent `customerId: "fake_cust_999"`. Expected: `PERMISSION_DENIED`.
7. **Orphan Repayment Creation**: Creating a repayment referencing a non-existent `loanId: "fake_loan_999"`. Expected: `PERMISSION_DENIED`.
8. **Path ID Poisoning**: Creating a document with a 500-char ID or invalid characters `../admin`. Expected: `PERMISSION_DENIED`.
9. **Client Timestamp Tampering**: Creating a loan with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`. Expected: `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Updating `ownerId` or `customerId` or `createdAt` on an existing loan. Expected: `PERMISSION_DENIED`.
11. **Value Type Poisoning**: Updating `principal` or `totalDue` to a string `"999999"` or negative number `-5000`. Expected: `PERMISSION_DENIED`.
12. **Terminal State Bypass**: Non-admin user attempting to mutate a loan whose existing `status == 'completed'`. Expected: `PERMISSION_DENIED`.
