import { ReactNode } from 'react';
import {
  Mail, MessageSquare, Monitor, Smartphone, BarChart3, Users, Megaphone,
  TrendingUp, FileText, Share2, MessageCircle, Zap,
} from 'lucide-react';
import { CommsChannel, COMMS_CHANNELS } from '../types';
import { SelectOption } from './Field';

const ICONS: Record<CommsChannel, ReactNode> = {
  'Mail': <Mail className="h-4 w-4" />,
  'Desktop Pop-up': <MessageSquare className="h-4 w-4" />,
  'Desktop Wallpaper': <Monitor className="h-4 w-4" />,
  'Lockscreen Wallpaper': <Smartphone className="h-4 w-4" />,
  'Sigma': <BarChart3 className="h-4 w-4" />,
  'MS Teams': <Users className="h-4 w-4" />,
  'Ticker': <Megaphone className="h-4 w-4" />,
  'Sales One': <TrendingUp className="h-4 w-4" />,
  'DMS': <FileText className="h-4 w-4" />,
  'BFL Social': <Share2 className="h-4 w-4" />,
  'SMS': <MessageCircle className="h-4 w-4" />,
  'Snapcomms': <Zap className="h-4 w-4" />,
};

export const channelIcon = (c: CommsChannel): ReactNode => ICONS[c];

export const CHANNEL_OPTIONS: SelectOption[] = COMMS_CHANNELS.map(c => ({ value: c, label: c, icon: ICONS[c] }));
