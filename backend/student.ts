import { db } from "./state"

export function studentProgress(id: number) {
  return db.query<{ day: string; direction: string; kind: "test" | "course"; xp: number; score: number | null }, [number]>(
    "SELECT day,direction,kind,xp,score FROM learning_results WHERE student_id=? ORDER BY day"
  ).all(id)
}

export function publicCard(id: number) {
  const card = db.query<{ bio: string; avatar_version: number; banner_version: number }, [number]>(
    "SELECT bio, avatar_version, banner_version FROM student_cards WHERE student_id=?"
  ).get(id)
  const base = "/api/student/public/" + id + "/"
  return { id, bio: card?.bio ?? "",
    avatar: card?.avatar_version ? base + "avatar?v=" + card.avatar_version : "",
    banner: card?.banner_version ? base + "banner?v=" + card.banner_version : "" }
}

