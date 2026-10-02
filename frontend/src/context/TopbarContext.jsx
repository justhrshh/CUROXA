import React, { createContext, useContext, useState, useCallback } from 'react';

export const TopbarContext = createContext({
  topbarContent: null,
  setTopbarContent: () => {}
});

export function TopbarProvider({ children }) {
  const [topbarContent, setTopbarContent] = useState(null);

  return (
    <TopbarContext.Provider value={{ topbarContent, setTopbarContent }}>
      {children}
    </TopbarContext.Provider>
  );
}

export const useTopbar = () => useContext(TopbarContext);
