import { redirect } from "next/navigation";

export default function Home() {
  // The daily brief is the default landing context (mockup).
  redirect("/brief");
}
