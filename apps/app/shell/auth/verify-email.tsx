// 'use client';

// import { verifyEmail } from '@delulu/auth/client';
// import { Button } from '@delulu/design-system/components/ui/button';
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardTitle,
// } from '@delulu/design-system/components/ui/card';
// import { CheckCircle, Loader2, XCircle } from 'lucide-react';
// import { useRouter } from 'next/navigation';
// import { useEffect, useState } from 'react';

// type VerifyEmailProps = {
//   token?: string;
//   onSuccess?: () => void;
//   redirectTo?: string;
// };

// export const VerifyEmail = ({
//   token,
//   onSuccess,
//   redirectTo,
// }: VerifyEmailProps) => {
//   const [isLoading, setIsLoading] = useState(true);
//   const [error, setError] = useState('');
//   const [success, setSuccess] = useState(false);
//   const router = useRouter();

//   useEffect(() => {
//     if (!token) {
//       setError('Invalid verification token');
//       setIsLoading(false);
//       return;
//     }

//     const verify = async () => {
//       try {
//         const result = await verifyEmail({
//           query: { token },
//         });

//         if (result.data) {
//           setSuccess(true);

//           // Redirect after a short delay
//           setTimeout(() => {
//             if (redirectTo) {
//               window.location.href = redirectTo;
//             } else if (onSuccess) {
//               onSuccess();
//             } else {
//               window.location.href = '/';
//             }
//           }, 2000);
//         }
//       } catch (err) {
//         setError(err instanceof Error ? err.message : 'Failed to verify email');
//       } finally {
//         setIsLoading(false);
//       }
//     };

//     verify();
//   }, [token, onSuccess, redirectTo]);

//   if (isLoading) {
//     return (
//       <Card className="w-full max-w-md">
//         <CardContent className="pt-6">
//           <div className="flex flex-col items-center space-y-4 text-center">
//             <div className="rounded-full bg-primary/10 p-3">
//               <Loader2 className="h-6 w-6 animate-spin text-primary" />
//             </div>
//             <div className="space-y-2">
//               <CardTitle className="text-xl">Verifying your email...</CardTitle>
//               <CardDescription>
//                 Please wait while we verify your email address
//               </CardDescription>
//             </div>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   if (success) {
//     return (
//       <Card className="w-full max-w-md">
//         <CardContent className="pt-6">
//           <div className="flex flex-col items-center space-y-4 text-center">
//             <div className="rounded-full bg-primary/10 p-3">
//               <CheckCircle className="h-6 w-6 text-primary" />
//             </div>
//             <div className="space-y-2">
//               <CardTitle className="text-primary text-xl">
//                 Email verified!
//               </CardTitle>
//               <CardDescription>
//                 Your email has been successfully verified. You'll be redirected
//                 shortly.
//               </CardDescription>
//             </div>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   return (
//     <Card className="w-full max-w-md">
//       <CardContent className="pt-6">
//         <div className="flex flex-col items-center space-y-4 text-center">
//           <div className="rounded-full bg-destructive/10 p-3">
//             <XCircle className="h-6 w-6 text-destructive" />
//           </div>
//           <div className="space-y-2">
//             <CardTitle className="text-destructive text-xl">
//               Verification failed
//             </CardTitle>
//             <CardDescription>{error}</CardDescription>
//           </div>
//           <Button
//             variant="outline"
//             onClick={() => router.push('/sign-in')}
//             className="w-full"
//           >
//             Back to sign in
//           </Button>
//         </div>
//       </CardContent>
//     </Card>
//   );
// };
