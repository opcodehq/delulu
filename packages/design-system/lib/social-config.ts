import type { SocialType } from '@delulu/validators/post';
import {
  FaFacebook,
  FaFacebookF,
  FaInstagram,
  FaLinkedin,
  FaLinkedinIn,
  FaPinterest,
  FaTiktok,
  FaTwitter,
  FaYoutube,
} from 'react-icons/fa';
import { FaThreads, FaXTwitter } from 'react-icons/fa6';
import { SiFarcaster } from 'react-icons/si';
import { TbSocial } from 'react-icons/tb';

export type SupportedSocialPlatform =
  | 'TWITTER'
  | 'LINKEDIN'
  | 'INSTAGRAM'
  | 'YOUTUBE'
  | 'TIKTOK'
  | 'FACEBOOK'
  | 'THREADS'
  | 'FARCASTER'
  | 'PINTEREST'
  | 'BLUESKY';

export const socialIcons = {
  TWITTER: FaXTwitter,
  LINKEDIN: FaLinkedin,
  INSTAGRAM: FaInstagram,
  YOUTUBE: FaYoutube,
  TIKTOK: FaTiktok,
  FACEBOOK: FaFacebookF,
  THREADS: FaThreads,
  FARCASTER: SiFarcaster,
  PINTEREST: FaPinterest,
  BLUESKY: TbSocial,
} as const;

export const socialColors = {
  TWITTER: 'text-black dark:text-white',
  LINKEDIN: 'text-sky-700',
  INSTAGRAM: 'text-[#E4405F]',
  YOUTUBE: 'text-red-600',
  TIKTOK: 'text-black dark:text-white',
  FACEBOOK: 'text-blue-600',
  THREADS: 'text-black dark:text-white',
  FARCASTER: 'text-purple-600',
  PINTEREST: 'text-red-600',
  BLUESKY: 'text-sky-500',
} as const;

export const socialBackgroundColors = {
  TWITTER: 'bg-black',
  LINKEDIN: 'bg-sky-700',
  INSTAGRAM: 'bg-gradient-to-r from-[#E4405F] to-[#FCAF45]',
  YOUTUBE: 'bg-red-600',
  TIKTOK: 'bg-black',
  FACEBOOK: 'bg-blue-600',
  THREADS: 'bg-black',
  FARCASTER: 'bg-purple-600',
  PINTEREST: 'bg-red-600',
  BLUESKY: 'bg-sky-500',
} as const;

export const socialDisplayNames = {
  TWITTER: 'X (Twitter)',
  LINKEDIN: 'LinkedIn',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  FARCASTER: 'Farcaster',
  PINTEREST: 'Pinterest',
  BLUESKY: 'Bluesky',
} as const;

export const socialDescriptions = {
  TWITTER: 'Connect your X account',
  LINKEDIN: 'Connect your profile or a Page',
  INSTAGRAM: 'Connect your Instagram profile',
  YOUTUBE: 'Connect your YouTube channel',
  TIKTOK: 'Connect your TikTok profile',
  FACEBOOK: 'Connect your Facebook page',
  THREADS: 'Connect your Threads profile',
  FARCASTER: 'Connect your Farcaster account',
  PINTEREST: 'Connect your Pinterest account',
  BLUESKY: 'Connect your Bluesky account',

} as const;

export const sizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-7 w-7',
} as const;

export type SocialIconSize = keyof typeof sizeClasses;
