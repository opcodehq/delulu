// 'use client';

// import { forgetPassword } from '@delulu/auth/client';
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
// import { CheckCircle } from 'lucide-react';
// import Link from 'next/link';
// import type React from 'react';
// import { useState } from 'react';

// type ForgotPasswordProps = {
//   onSuccess?: () => void;
// };

// export const ForgotPassword = ({ onSuccess }: ForgotPasswordProps) => {
//   const [email, setEmail] = useState('');
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [success, setSuccess] = useState(false);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setError('');

//     try {
//       await forgetPassword({
//         email,
//         redirectTo: '/reset-password',
//       });

//       setSuccess(true);
//       if (onSuccess) {
//         onSuccess();
//       }
//     } catch (err) {
//       setError(
//         err instanceof Error ? err.message : 'Failed to send reset email'
//       );
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   if (success) {
//     return (
//       <Card className="w-full max-w-md">
//         <CardContent className="pt-6">
//           <div className="flex flex-col items-center space-y-4 text-center">
//             <div className="rounded-full bg-primary/10 p-3">
//               <CheckCircle className="h-6 w-6 text-primary" />
//             </div>
//             <div className="space-y-2">
//               <CardTitle className="text-xl">Check your email</CardTitle>
//               <CardDescription>
//                 We've sent a password reset link to {email}
//               </CardDescription>
//             </div>
//             <Button variant="outline" className="w-full" asChild>
//               <Link href="/sign-in">Back to sign in</Link>
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
//           Forgot your password?
//         </CardTitle>
//         <CardDescription>
//           Enter your email and we'll send you a reset link
//         </CardDescription>
//       </CardHeader>
//       <CardContent className="space-y-4">
//         <form onSubmit={handleSubmit} className="space-y-4">
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

//           {error && (
//             <Alert variant="destructive">
//               <AlertDescription>{error}</AlertDescription>
//             </Alert>
//           )}

//           <Button type="submit" className="w-full" disabled={isLoading}>
//             {isLoading ? 'Sending...' : 'Send reset link'}
//           </Button>
//         </form>

//         <Button variant="ghost" className="w-full" asChild>
//           <Link href="/sign-in">Back to sign in</Link>
//         </Button>
//       </CardContent>
//     </Card>
//   );
// };
