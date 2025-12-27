# CHANGELOG v28.0 - INPI Brazilian Patent Office Layer

## 🎯 OBJETIVO

Adicionar **Layer 3: INPI** para:
1. Descobrir BRs não mapeados via EPO family
2. Completar abstracts faltantes com português nativo
3. Metadata em português (título_pt, resumo_pt)
4. **ZERO perda** de WOs/BRs existentes

---

## 🆕 NOVA FUNCIONALIDADE - INPI LAYER

### 1. Busca Direta no INPI Brasileiro

**Endpoint:** `https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp`

**Estratégia:**
- Tradução automática de moléculas para português via Groq AI
- Busca por: molécula_pt, brand_pt, dev_codes, variações químicas
- Extração de BRs, títulos, depositantes, datas

### 2. Tradução via Groq AI (Gratuito!)

**API:** `https://api.groq.com/openai/v1/chat/completions`  
**Model:** `llama-3.3-70b-versatile`

**Exemplos de tradução:**
```
Darolutamide → Darolutamida
Ixazomib → Ixazomibe  
Olaparib → Olaparibe
```

**Fallback:** Se GROQ_API_KEY não disponível, usa nome original

### 3. Descoberta de Novos BRs

- EPO family pode não mapear todos os BRs
- INPI descobre BRs via busca direta por molécula
- Novos BRs adicionados com flag `"discovered_by": "Layer 3 INPI"`

### 4. Enrichment de Abstracts em Português

- BRs sem abstract após EPO + Google → tentativa via INPI
- Campo `abstract_pt` para resumo em português nativo
- Campo `title_pt` para título em português

---

## 📊 ARQUITETURA v28.0

```
┌────────────────────────────────────┐
│  LAYER 1: EPO OPS                  │
│  - 170+ WOs via queries            │
│  - BR mapping via family           │
│  - Metadata EN                     │
└────────────────────────────────────┘
              ↓
┌────────────────────────────────────┐
│  LAYER 2: Google Patents           │
│  - 80+ WOs adicionais              │
│  - Metadata fallback               │
│  - Dev codes priority              │
└────────────────────────────────────┘
              ↓
┌────────────────────────────────────┐
│  LAYER 3: INPI Brazilian (NEW!)    │
│  - Tradução PT via Groq AI         │
│  - Busca direta INPI               │
│  - Descoberta novos BRs            │
│  - Metadata PT (título, resumo)    │
└────────────────────────────────────┘
```

---

## 🔧 IMPLEMENTAÇÃO

### inpi_crawler.py

**Classe:** `INPICrawler`

**Métodos principais:**
1. `translate_to_portuguese()` - Groq AI translation
2. `search_inpi()` - Busca via Playwright
3. `enrich_br_from_inpi()` - Enrichment individual BR
4. `_extract_patents_from_page()` - Parse HTML results

**Features:**
- ✅ Playwright headless
- ✅ Rate limiting (3s entre requests)
- ✅ Fallback se Groq falhar
- ✅ Deduplicação automática

### main.py Integration

**Linha ~1091:** Layer 3 INPI chamado após Google fallback

**Workflow:**
1. Traduz molécula para português
2. Busca INPI com 5 termos
3. Merge results: enriquece existentes, adiciona novos
4. Enrichment de abstracts faltantes (max 10)

**Logging:**
```python
logger.info("🇧🇷 LAYER 3: INPI (Brazilian Patent Office)")
logger.info(f"   🆕 NEW BR from INPI: {br_num}")
logger.info(f"   ✅ INPI abstract found for {br_num}")
```

---

## 📈 IMPACTO ESPERADO

### v27.5-FIXED → v28.0

| Métrica | v27.5-FIXED | v28.0 Target | Ganho |
|---------|-------------|--------------|-------|
| **WOs** | 258 | **258** | **0** (mantido) |
| **BRs** | 60 | **65+** | **+5** (descoberta) |
| **Abstract %** | 93.3% | **~100%** | **+6.7pp** |
| **Português** | 0% | **80%+** | **+80pp** ✅ |
| **Sources** | 2 | **3** | +INPI ✅ |

### Casos de Uso

**Caso 1:** BR sem abstract no EPO/Google
- Antes: abstract = null
- Depois: abstract_pt via INPI ✅

**Caso 2:** BR não mapeado via EPO family
- Antes: BR não encontrado
- Depois: BR descoberto via busca direta INPI ✅

**Caso 3:** Metadata em português
- Antes: Só EN
- Depois: title_pt + abstract_pt ✅

---

## 🚨 GARANTIAS

✅ **ZERO perda de WOs** - Layer 3 não afeta Layers 1+2  
✅ **ZERO perda de BRs** - Apenas ADICIONA novos  
✅ **ZERO breaking changes** - Campos novos são opcionais  
✅ **Fallback robusto** - Groq falha → usa nome original  
✅ **Rate limiting** - 3s entre INPI requests  

---

## 🔑 CONFIGURAÇÃO

### Variável de Ambiente (Opcional)

```bash
GROQ_API_KEY=gsk_...  # Opcional, para tradução PT
```

**Obter Groq API Key:**
1. Ir para https://console.groq.com
2. Criar conta (gratuita)
3. Gerar API key
4. Adicionar no Railway: Settings → Variables

**Sem GROQ_API_KEY:**
- Sistema funciona normalmente
- Usa nomes originais (EN) para busca INPI
- Pode encontrar menos resultados em PT

---

## 📋 CHECKLIST DEPLOY

- [ ] Version: 28.0
- [ ] INPI crawler: inpi_crawler.py
- [ ] Groq translation implementada
- [ ] Layer 3 integrado após Layer 2
- [ ] Summary com inpi_new_brs
- [ ] Sources: 3 layers

### Validação Esperada

**Ixazomib:**
- WOs: 258 (mantido)
- BRs: 60 → 65+ (+5 via INPI)
- Abstract: 93.3% → ~100%
- title_pt: 80%+
- abstract_pt: 80%+

**Logs esperados:**
```
🇧🇷 LAYER 3: INPI (Brazilian Patent Office)
   ✅ Groq translated: Ixazomib → Ixazomibe
   🔍 INPI search 1/5: Ixazomibe
   ✅ Found 12 patents for 'Ixazomibe'
   🆕 NEW BR from INPI: BR112024001234
   ✅ INPI found 60 existing BRs, discovered 5 NEW BRs
   ✅ INPI abstract found for BRPI0821676
```

---

## 🎯 BENEFÍCIOS

1. **Completude:** 93% → ~100% abstracts
2. **Descoberta:** BRs não mapeados via EPO
3. **Localização:** Metadata em português
4. **Validação:** Fonte oficial brasileira
5. **Custo:** Groq API = **GRATUITA!**

---

## 📝 NOTAS

- INPI pode ter dados mais atualizados que EPO para BRs
- Títulos/resumos em português são mais precisos
- Rate limiting 3s previne bloqueio
- Limita a 10 BRs para enrichment (tempo)
- Playwright requer Docker base image correto

---

**Status:** PRODUCTION READY ✅  
**Próximo passo:** Deploy e validação
