import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

export function TrendChartInner({ data }: { data: Array<{ value: number }> }) {
  return (
    <ResponsiveContainer width="99%" height="100%">
      <LineChart data={data}>
        <YAxis domain={['auto', 'auto']} hide />
        <Tooltip
          contentStyle={{
            backgroundColor: '#050505',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '16px',
          }}
          itemStyle={{ color: '#0ea5e9' }}
          labelStyle={{ color: '#64748b', marginBottom: '6px' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#0ea5e9"
          strokeWidth={3}
          dot={{ r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke: '#050505' }}
          activeDot={{ r: 6, fill: '#0ea5e9', strokeWidth: 2, stroke: '#050505' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
