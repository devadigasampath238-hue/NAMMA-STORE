"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerWithEmail } from "../../firebase";
import { syncUser } from "../../api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const user = await registerWithEmail(name, email, password);
      // Create the matching row in our own database with phone number too
      // (Firebase's own profile object has no phone field for email signups).
      try {
        await syncUser({ firebaseUid: user.uid, email, displayName: name, phone });
      } catch (syncErr: any) {
        // The Firebase account WAS created at this point - this is our own
        // backend rejecting/failing the sync call (down, CORS, validation),
        // not a Firebase auth error, so show its real message instead of
        // the Firebase-style friendlyError() below.
        setError(
          `Account created, but we couldn't finish setting up your profile: ${
            syncErr?.message || "the server didn't respond."
          } You can try logging in - if it still fails, check that the backend is running.`
        );
        return;
      }
      router.push("/account");
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto py-8">
      <h1 className="text-2xl font-bold mb-1">Create Account</h1>
      <p className="text-gray-500 text-sm mb-6">Join Namma Store in a minute.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <p className="text-xs text-gray-400 mt-1">At least 6 characters.</p>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-lg font-medium"
        >
          {submitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-orange-700 underline">
          Login
        </Link>
      </p>
    </div>
  );
}

function friendlyError(code?: string) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in isn't turned on for this project yet. In the Firebase console, go to Authentication > Sign-in method and enable Email/Password.";
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return "The app isn't connected to Firebase correctly. Check the NEXT_PUBLIC_FIREBASE_* values in .env.local against your Firebase project settings.";
    case "auth/network-request-failed":
      return "Couldn't reach Firebase. Check your internet connection and try again.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized for sign-in. Add localhost under Authentication > Settings > Authorized domains in the Firebase console.";
    default:
      // Surface the real reason instead of a dead-end generic message -
      // this is almost always a Firebase project/config issue (e.g.
      // Email/Password sign-in not enabled) rather than bad user input.
      return code
        ? `Couldn't create your account (${code}). Please check your details and try again.`
        : "Couldn't create your account. Please check your details and try again.";
  }
}
