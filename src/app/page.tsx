import { AuthHeader } from "@/components/AuthHeader";
import { HomeClient } from "@/components/HomeClient";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <AuthHeader email={user?.email} />
      <HomeClient />
    </>
  );
}
