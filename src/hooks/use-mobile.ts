import { useEffect, useState } from 'react';

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);
  return isMobile;
}

export default useIsMobile;
