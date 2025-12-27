"""
INPI Crawler Layer 3 - Brazilian Patent Office
Busca direta no INPI brasileiro para:
1. Completar abstracts faltantes (português nativo)
2. Descobrir BRs não mapeados via EPO family
3. Metadata em português (título, resumo original)
"""
import asyncio
import re
import os
from typing import List, Set, Dict, Optional
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
import httpx


class INPICrawler:
    """Crawler para busca direta no INPI brasileiro"""
    
    def __init__(self):
        self.base_url = "https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp"
        self.found_brs = set()
        
    async def translate_to_portuguese(self, molecule_name: str, groq_api_key: Optional[str] = None) -> str:
        """
        Traduz nome da molécula para português usando Groq AI (gratuito)
        Exemplos: Darolutamide → Darolutamida, Ixazomib → Ixazomibe
        """
        if not groq_api_key:
            groq_api_key = os.getenv("GROQ_API_KEY")
        
        if not groq_api_key:
            print(f"   ⚠️  GROQ_API_KEY not found, using original name: {molecule_name}")
            return molecule_name
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {groq_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "llama-3.3-70b-versatile",
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a pharmaceutical terminology expert. Translate drug molecule names from English to Brazilian Portuguese. Return ONLY the translated name, nothing else. Examples: Darolutamide→Darolutamida, Ixazomib→Ixazomibe, Olaparib→Olaparibe"
                            },
                            {
                                "role": "user",
                                "content": f"Translate to Portuguese: {molecule_name}"
                            }
                        ],
                        "temperature": 0.1,
                        "max_tokens": 50
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    translated = data["choices"][0]["message"]["content"].strip()
                    # Limpar possíveis quotes ou markdown
                    translated = translated.replace('"', '').replace("'", "").strip()
                    print(f"   ✅ Groq translated: {molecule_name} → {translated}")
                    return translated
                else:
                    print(f"   ⚠️  Groq API error {response.status_code}, using original name")
                    return molecule_name
        
        except Exception as e:
            print(f"   ⚠️  Groq translation failed: {e}, using original name")
            return molecule_name
    
    async def search_inpi(
        self,
        molecule: str,
        brand: Optional[str] = None,
        dev_codes: List[str] = None,
        groq_api_key: Optional[str] = None
    ) -> List[Dict]:
        """
        Busca no INPI usando Playwright
        Retorna lista de BRs encontrados com metadata
        """
        print(f"🇧🇷 Layer 3 INPI: Buscando no INPI brasileiro para {molecule}...")
        
        # Traduzir para português
        molecule_pt = await self.translate_to_portuguese(molecule, groq_api_key)
        
        # Construir termos de busca
        search_terms = [molecule_pt]
        
        if brand:
            brand_pt = await self.translate_to_portuguese(brand, groq_api_key)
            search_terms.append(brand_pt)
        
        # Dev codes não precisam tradução
        if dev_codes:
            search_terms.extend(dev_codes[:3])
        
        # Adicionar variações químicas em português
        chemical_variants = [
            f"{molecule_pt} sal",
            f"{molecule_pt} composto",
            f"{molecule_pt} cristal",
            f"{molecule_pt} farmaceutic"
        ]
        search_terms.extend(chemical_variants)
        
        print(f"   📊 INPI search terms: {len(search_terms)}")
        
        all_patents = []
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage'
                    ]
                )
                
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                )
                
                page = await context.new_page()
                
                # Buscar com os primeiros 5 termos
                for i, term in enumerate(search_terms[:5]):
                    try:
                        print(f"   🔍 INPI search {i+1}/5: {term}")
                        
                        # Ir para página de busca
                        await page.goto(self.base_url, wait_until='domcontentloaded', timeout=30000)
                        await asyncio.sleep(2)
                        
                        # Preencher campo de busca (ExpressaoPesquisa)
                        search_input = await page.query_selector('input[name="ExpressaoPesquisa"]')
                        if not search_input:
                            search_input = await page.query_selector('input[type="text"]')
                        
                        if search_input:
                            await search_input.fill(term)
                            await asyncio.sleep(1)
                            
                            # Click buscar
                            submit_btn = await page.query_selector('input[type="submit"]')
                            if not submit_btn:
                                submit_btn = await page.query_selector('button[type="submit"]')
                            
                            if submit_btn:
                                await submit_btn.click()
                                await page.wait_for_load_state('networkidle', timeout=20000)
                                await asyncio.sleep(2)
                                
                                # Extrair resultados
                                patents = await self._extract_patents_from_page(page)
                                if patents:
                                    all_patents.extend(patents)
                                    print(f"   ✅ Found {len(patents)} patents for '{term}'")
                        
                        await asyncio.sleep(3)  # Rate limiting
                    
                    except PlaywrightTimeout:
                        print(f"   ⏱️  Timeout searching for: {term}")
                        continue
                    except Exception as e:
                        print(f"   ⚠️  Error searching '{term}': {e}")
                        continue
                
                await browser.close()
        
        except Exception as e:
            print(f"❌ INPI crawler error: {e}")
        
        # Deduplicate
        unique_patents = {}
        for patent in all_patents:
            br_num = patent.get('patent_number')
            if br_num and br_num not in unique_patents:
                unique_patents[br_num] = patent
        
        result = list(unique_patents.values())
        print(f"🎯 Layer 3 INPI: Found {len(result)} unique BR patents")
        
        return result
    
    async def _extract_patents_from_page(self, page) -> List[Dict]:
        """Extrai patentes da página de resultados INPI"""
        try:
            patents = await page.evaluate("""
                () => {
                    const results = [];
                    const rows = document.querySelectorAll('table tr');
                    
                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        
                        // Skip header rows
                        if (cells.length >= 3) {
                            const firstCell = cells[0].innerText.trim();
                            
                            // Skip if header
                            if (firstCell.includes('Pedido') || firstCell.includes('Número')) {
                                return;
                            }
                            
                            // Extract BR number
                            const brMatch = firstCell.match(/BR[A-Z0-9]+/);
                            if (brMatch) {
                                results.push({
                                    patent_number: brMatch[0],
                                    title: cells[1]?.innerText?.trim() || '',
                                    filing_date: cells[2]?.innerText?.trim() || '',
                                    applicants: cells[3]?.innerText?.trim() ? [cells[3].innerText.trim()] : [],
                                    source: 'INPI'
                                });
                            }
                        }
                    });
                    
                    return results;
                }
            """)
            
            return patents
        
        except Exception as e:
            print(f"   ⚠️  Error extracting patents from page: {e}")
            return []
    
    async def enrich_br_from_inpi(self, br_number: str) -> Optional[Dict]:
        """
        Enriquece um BR específico com dados do INPI
        Retorna abstract em português, título original, etc
        """
        print(f"   🔍 INPI enriching: {br_number}")
        
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
                page = await browser.new_page()
                
                # Buscar BR específico
                await page.goto(self.base_url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(2)
                
                # Preencher com número BR
                search_input = await page.query_selector('input[name="ExpressaoPesquisa"]')
                if search_input:
                    await search_input.fill(br_number)
                    await asyncio.sleep(1)
                    
                    submit_btn = await page.query_selector('input[type="submit"]')
                    if submit_btn:
                        await submit_btn.click()
                        await page.wait_for_load_state('networkidle', timeout=20000)
                        await asyncio.sleep(2)
                        
                        # Click no BR para ver detalhes
                        link = await page.query_selector(f'a:has-text("{br_number}")')
                        if link:
                            await link.click()
                            await page.wait_for_load_state('networkidle', timeout=20000)
                            await asyncio.sleep(2)
                            
                            # Extrair metadata da página de detalhes
                            metadata = await page.evaluate("""
                                () => {
                                    const data = {
                                        title_pt: '',
                                        abstract_pt: '',
                                        applicants: [],
                                        inventors: [],
                                        ipc_codes: []
                                    };
                                    
                                    // Procurar título
                                    const titleElem = document.querySelector('td:has-text("Título"), th:has-text("Título")');
                                    if (titleElem && titleElem.nextElementSibling) {
                                        data.title_pt = titleElem.nextElementSibling.innerText.trim();
                                    }
                                    
                                    // Procurar resumo
                                    const abstractElem = document.querySelector('td:has-text("Resumo"), th:has-text("Resumo")');
                                    if (abstractElem && abstractElem.nextElementSibling) {
                                        data.abstract_pt = abstractElem.nextElementSibling.innerText.trim();
                                    }
                                    
                                    // Procurar depositante
                                    const applicantElem = document.querySelector('td:has-text("Depositante"), th:has-text("Depositante")');
                                    if (applicantElem && applicantElem.nextElementSibling) {
                                        const apps = applicantElem.nextElementSibling.innerText.trim();
                                        data.applicants = apps.split(';').map(a => a.trim()).filter(a => a);
                                    }
                                    
                                    return data;
                                }
                            """)
                            
                            await browser.close()
                            
                            if metadata.get('title_pt') or metadata.get('abstract_pt'):
                                print(f"   ✅ INPI enriched {br_number}")
                                return metadata
                
                await browser.close()
        
        except Exception as e:
            print(f"   ⚠️  INPI enrichment error for {br_number}: {e}")
        
        return None


# Instance singleton
inpi_crawler = INPICrawler()
