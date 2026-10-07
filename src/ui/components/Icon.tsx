import {
  Bell, Book, Briefcase, CalendarDays, Car, Circle, Coffee, Dumbbell, Flag, Heart, Home, Mail,
  Phone, Reply, Clock, ShoppingCart, Star, User, Zap, GraduationCap, Plane, Wallet, Code, Camera, Music,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  circle: Circle, calendar: CalendarDays, bell: Bell, reply: Reply, phone: Phone, briefcase: Briefcase,
  user: User, star: Star, flag: Flag, heart: Heart, home: Home, book: Book, dumbbell: Dumbbell,
  car: Car, mail: Mail, cart: ShoppingCart, coffee: Coffee, zap: Zap, school: GraduationCap,
  plane: Plane, clock: Clock, wallet: Wallet, code: Code, camera: Camera, music: Music,
};

export function CatIcon({ name, size = 14, color }: { name: string; size?: number; color?: string }) {
  const I = CATEGORY_ICONS[name] ?? Circle;
  return <I size={size} strokeWidth={1.8} color={color} />;
}

export function BrandMark({ size = 22 }: { size?: number }) {
  // Monogramme « C » ouvert + point : un assistant discret qui veille.
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="var(--text)" />
      <path d="M21.5 11.2A7 7 0 1 0 21.5 20.8" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="22.2" cy="16" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

export function CheckSvg() {
  return (
    <svg viewBox="0 0 12 12">
      <path d="M2.5 6.4 5 8.8 9.6 3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
