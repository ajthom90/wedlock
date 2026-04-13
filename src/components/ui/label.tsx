'use client';
import React, { forwardRef, LabelHTMLAttributes } from 'react';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className = '', ...props }, ref) => <label ref={ref} className={`block text-sm font-medium text-gray-700 ${className}`} {...props} />
);
Label.displayName = 'Label';
