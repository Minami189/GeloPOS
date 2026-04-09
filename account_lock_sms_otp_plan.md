# Account-Based Locking & SMS OTP Integration Plan

## Objective
To implement a truly wipe-proof anti-bruteforce security feature by locking the compromised **User Account** globally, rather than the physical device. To reduce employee downtime, this lock will be paired with an **SMS One-Time Password (OTP)** system, allowing legitimate users to prove their identity and instantly instantly bypass the time-based lock.

---

## 1. Cloud Infrastructure (Supabase)

### Table: `account_locks`
We will replace the device-centric lock with a user-centric lock.
- `username` (Primary Key)
- `failed_attempts` (Integer)
- `lock_duration_minutes` (Real)
- `locked_until` (Timestamp with Time Zone)

### Table Updates: `users`
We must attach a trusted phone number to each employee account.
- Add column `phone_number` (Text, nullable) to the existing `users` table.

---

## 2. SMS Gateway Integration

To send SMS messages, we have two primary options:
1. **Twilio API (Recommended)**: A standard, robust service for sending code-based texts. We would trigger a Supabase Edge Function to securely call the Twilio API locally without exposing API keys.
2. **Supabase Auth native SMS**: If we migrate users to Supabase Auth, they include built-in SMS limits via generic providers (like Twilio/MessageBird).

---

## 3. Application Workflow

### Phase A: The Lockout
1. The employee attempts to login. Their attempts are tracked against their `username`.
2. Upon **5 failed attempts**, the cloud `account_locks` table marks their `locked_until` for `NOW() + 30 minutes`.
3. The POS physically blocks any device anywhere in the world from logging in as that username. 

### Phase B: SMS Unlock Flow
1. When the "Account Locked" screen appears, we conditionally show an actionable button: **"Unlock via SMS"** *(only if `user.phone_number` exists)*.
2. The user clicks the button. The frontend invokes a Supabase Edge Function: `send-unlock-otp`.
3. Edge Function generates a secure 6-digit code, stores it in an `otp_codes` table with a 5-minute expiry, and sends the text to the user's registered phone.
4. The POS shifts to an **Enter OTP** screen.

### Phase C: Verification
1. User receives the text and inputs the 6-digit code.
2. The app verifies the code against the `otp_codes` table.
3. If successful, the app completely deletes the user's entry in `account_locks` and automatically logs them in as a trusted user.

---

## 4. Implementation Steps when ready
1. Setup Twilio Account & get Phone/Auth tokens.
2. Create `account_locks` and `otp_codes` tables in Supabase SQL editor.
3. Deploy Supabase Edge Functions for sending and validating texts (keeping API keys hidden from the frontend code).
4. Build the OTP Verification UI inside `LoginScreen.js`.
5. Update `syncService.js` to target Usernames instead of Device IDs.
