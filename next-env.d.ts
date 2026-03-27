/// <reference types="next" />
/// <reference types="next/image-types/global" />
import type * as React from 'react';
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

declare namespace JSX {
  interface IntrinsicElements {
    'emoji-picker': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
