import React from "react";
import { useScrollShadow } from "./useScrollShadow.js";

/* A horizontally scrollable wrapper for the wide data tables. On a phone the
   rate and reconciliation tables are wider than the card; this lets them keep
   their natural width and scroll sideways rather than cramming their columns,
   with an edge shadow marking whichever side has more to see. */
export default function ScrollTable({ children, className = "" }) {
  const { wrapperProps, scrollProps } = useScrollShadow();
  return (
    <div className={`bt-scroll-shadow bt-table-scroll ${className}`.trim()} {...wrapperProps}>
      <div className="bt-table-scroll-inner" {...scrollProps}>
        {children}
      </div>
    </div>
  );
}
