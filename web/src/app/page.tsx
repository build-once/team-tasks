import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Team Tasks</h1>
      <p>Your team&apos;s to-do list. Coming soon.</p>
      <p>
        <Link href="/tasks">My tasks</Link> · <Link href="/login">Sign in</Link>{" "}
        · <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
