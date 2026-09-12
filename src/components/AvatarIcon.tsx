import React, { useState, useEffect } from 'react';
import { 
  Stethoscope, 
  Brain, 
  Pill, 
  ShieldAlert, 
  Microscope, 
  Compass, 
  Dna, 
  HeartPulse, 
  FlaskConical, 
  BookOpen, 
  User, 
  GraduationCap
} from 'lucide-react';

interface AvatarIconProps {
  avatarId?: string;
  avatarKey?: string;
  avatarUrl?: string;
  className?: string;
  sizeClassName?: string;
  size?: number;
}

export const AvatarIcon: React.FC<AvatarIconProps> = ({
  avatarId,
  avatarKey,
  avatarUrl,
  className = '',
  sizeClassName = '',
  size = 20,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    const hasSizeClass = Boolean(sizeClassName && sizeClassName.trim());
    return (
      <img
        src={avatarUrl}
        alt="Profile Avatar"
        className={`rounded-full object-cover shrink-0 ${sizeClassName || 'w-10 h-10'} ${className || ''}`}
        style={!hasSizeClass && size ? { width: `${size}px`, height: `${size}px` } : undefined}
        onError={() => setImgError(true)}
      />
    );
  }

  const key = avatarKey || avatarId || 'caduceus';
  const combinedClass = `${sizeClassName} ${className}`.trim();

  switch (key) {
    case 'caduceus':
    case 'stethoscope':
      return <Stethoscope size={size} className={combinedClass || 'text-teal-600'} />;
    case 'brain':
      return <Brain size={size} className={combinedClass || 'text-purple-600'} />;
    case 'capsule':
    case 'pill':
      return <Pill size={size} className={combinedClass || 'text-blue-600'} />;
    case 'mask':
    case 'ghost':
      return <ShieldAlert size={size} className={combinedClass || 'text-amber-600'} />;
    case 'microscope':
      return <Microscope size={size} className={combinedClass || 'text-emerald-600'} />;
    case 'compass':
      return <Compass size={size} className={combinedClass || 'text-indigo-600'} />;
    case 'dna':
      return <Dna size={size} className={combinedClass || 'text-cyan-600'} />;
    case 'heart':
      return <HeartPulse size={size} className={combinedClass || 'text-rose-600'} />;
    case 'flask':
      return <FlaskConical size={size} className={combinedClass || 'text-violet-600'} />;
    case 'book':
      return <BookOpen size={size} className={combinedClass || 'text-sky-600'} />;
    case 'grad':
      return <GraduationCap size={size} className={combinedClass || 'text-teal-700'} />;
    default:
      return <User size={size} className={combinedClass || 'text-slate-600'} />;
  }
};
