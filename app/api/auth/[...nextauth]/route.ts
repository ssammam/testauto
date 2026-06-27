import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase());

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user }: { user: any }) {
      console.log("[NextAuth] signIn callback triggered for email:", user?.email);
      console.log("[NextAuth] allowed emails list:", allowedEmails);
      
      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        console.log("[NextAuth] Email IS in allowed list. Approving login.");
        return true;
      }
      
      console.log("[NextAuth] Email NOT in allowed list. Rejecting login.");
      return false;
    },
    async session({ session, token }: { session: any, token: any }) {
      console.log("[NextAuth] session callback triggered.");
      return session;
    },
  },
  pages: {
    signIn: '/login', // We will create this page
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
