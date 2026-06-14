import React from "react";
import { Purchase } from "../types";
import { ShoppingBag, Calendar, Tag, DollarSign } from "lucide-react";

interface PurchaseHistoryTableProps {
  purchases: Purchase[];
}

export default function PurchaseHistoryTable({ purchases }: PurchaseHistoryTableProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" id="purchase-history-card">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            Recent Purchases
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Historical data used for loyalty orchestration</p>
        </div>
        <span className="text-xs font-mono bg-slate-200/60 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
          {purchases.length} Items Captured
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-150 bg-slate-50/20 text-xs text-slate-500 font-medium uppercase tracking-wider">
              <th className="py-3 px-5">Item Details</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-5 text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {purchases.map((purchase) => (
              <tr key={purchase.id} className="hover:bg-slate-50/40 transition-colors">
                <td className="py-3.5 px-5">
                  <div className="font-medium text-slate-800">{purchase.item}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {purchase.id}</div>
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-slate-100/80 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                    <Tag className="w-3" />
                    {purchase.category}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-medium text-slate-900 font-mono">
                  ${purchase.amount.toFixed(2)}
                </td>
                <td className="py-3.5 px-5 text-right text-slate-500 text-xs font-mono">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Calendar className="w-3" />
                    {purchase.date}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
