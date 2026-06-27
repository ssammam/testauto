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
      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        return true;
      }
      return false; // Redirects to an error page or access denied
    },
    async session({ session, token }: { session: any, token: any }) {
      return session;
    },
  },
  pages: {
    signIn: '/login', // We will create this page
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
