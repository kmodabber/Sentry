// C4 Brand list: brands/brands.json -> brand checks (05 section 3). Owner Brandon.

export interface Brand {
  id: string;
  name: string;
  domains: string[];
  keywords: string[];
  country: string;
}
