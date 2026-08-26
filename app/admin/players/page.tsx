"use client";

import React from "react";


import ActivePlayers from "../components/players/ActivePlayers";


export default function TournamentPage() {
  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* 1. Performance Overview Row */}
      <ActivePlayers />

      

      
    </div>
  );
}