"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginWithEmail } from "../../firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await loginWithEmail(email, password);
      router.push("/account");
    } catch (err: any) {
      setError(friendlyError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto py-8">
      <h1 className="text-2xl font-bold mb-1">Login</h1>
      <p className="text-gray-500 text-sm mb-6">Welcome back to Namma Store.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-lg font-medium"
        >
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-6 text-center">
        New to Namma Store?{" "}
        <Link href="/register" className="text-orange-700 underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function friendlyError(code?: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
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
      return code
        ? `Couldn't log in (${code}). Please check your details and try again.`
        : "Couldn't log in. Please check your details and try again.";
  }
}
