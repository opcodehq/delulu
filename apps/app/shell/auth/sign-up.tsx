// 'use client';

// import { signIn, signUp } from '@delulu/auth/client';
// import {
//   Alert,
//   AlertDescription,
// } from '@delulu/design-system/components/ui/alert';
// import { Button } from '@delulu/design-system/components/ui/button';
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from '@delulu/design-system/components/ui/card';
// import { Input } from '@delulu/design-system/components/ui/input';
// import { Label } from '@delulu/design-system/components/ui/label';
// import { Separator } from '@delulu/design-system/components/ui/separator';
// import { CheckCircle } from 'lucide-react';
// import { useRouter } from 'next/navigation';
// import type React from 'react';
// import { useState } from 'react';

// type SignUpProps = {
//   onSuccess?: () => void;
//   redirectTo?: string;
// };

// export const SignUp = ({ onSuccess: _onSuccess, redirectTo }: SignUpProps) => {
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [name, setName] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [emailSent, setEmailSent] = useState(false);
//   const router = useRouter();

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setError('');

//     const result = await signUp.email({
//       email,
//       password,
//       name,
//     });

//     console.log(result, 'result');

//     if (result.data) {
//       // With email verification enabled, user needs to verify email first
//       setEmailSent(true);
//     }
//     if (result.error) {
//       console.log(result.error);
//       setError(result.error.message || 'Something went wrong');
//     }
//   };

//   const handleGoogleSignUp = async () => {
//     setIsLoading(true);
//     const result = await signIn.social({
//       provider: 'google',
//     });
//     if (result.error) {
//       console.log(result.error);
//       setError(result.error.message || 'Something went wrong');
//     }
//     setIsLoading(false);
//   };

//   if (emailSent) {
//     return (
//       <Card className="mx-auto w-full max-w-md">
//         <CardContent className="pt-6">
//           <div className="flex flex-col items-center space-y-4 text-center">
//             <div className="rounded-full bg-primary/10 p-3">
//               <CheckCircle className="h-6 w-6 text-primary" />
//             </div>
//             <div className="space-y-2">
//               <CardTitle className="text-xl">Check your email</CardTitle>
//               <CardDescription>
//                 We've sent a verification link to {email}. Please verify your
//                 email to complete your account setup.
//               </CardDescription>
//             </div>
//             <Button
//               variant="outline"
//               onClick={() => router.push('/sign-in')}
//               className="w-full"
//             >
//               Back to sign in
//             </Button>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   return (
//     <Card className="mx-auto w-full max-w-md">
//       <CardHeader className="space-y-1">
//         <CardTitle className="font-semibold text-2xl tracking-tight">
//           Create your account
//         </CardTitle>
//         <CardDescription>
//           Enter your details to create your account
//         </CardDescription>
//       </CardHeader>
//       <CardContent className="space-y-4">
//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="space-y-2">
//             <Label htmlFor="name">Full Name</Label>
//             <Input
//               id="name"
//               type="text"
//               placeholder="Enter your full name"
//               value={name}
//               onChange={(e) => setName(e.target.value)}
//               required
//             />
//           </div>
//           <div className="space-y-2">
//             <Label htmlFor="email">Email</Label>
//             <Input
//               id="email"
//               type="email"
//               placeholder="Enter your email"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               required
//             />
//           </div>
//           <div className="space-y-2">
//             <Label htmlFor="password">Password</Label>
//             <Input
//               id="password"
//               type="password"
//               placeholder="Create a password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               minLength={8}
//             />
//           </div>

//           {error && (
//             <Alert variant="destructive">
//               <AlertDescription>{error}</AlertDescription>
//             </Alert>
//           )}

//           <Button type="submit" className="w-full" disabled={isLoading}>
//             {isLoading ? 'Creating account...' : 'Create Account'}
//           </Button>
//         </form>

//         <div className="relative">
//           <div className="absolute inset-0 flex items-center">
//             <Separator className="w-full" />
//           </div>
//           <div className="relative flex justify-center text-xs uppercase">
//             <span className="bg-background px-2 text-muted-foreground">
//               Or continue with
//             </span>
//           </div>
//         </div>

//         <Button
//           variant="outline"
//           type="button"
//           className="w-full"
//           onClick={handleGoogleSignUp}
//           disabled={isLoading}
//         >
//           <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
//             <path
//               d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
//               fill="#4285F4"
//             />
//             <path
//               d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
//               fill="#34A853"
//             />
//             <path
//               d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
//               fill="#FBBC05"
//             />
//             <path
//               d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
//               fill="#EA4335"
//             />
//           </svg>
//           Continue with Google
//         </Button>
//       </CardContent>
//     </Card>
//   );
// };
