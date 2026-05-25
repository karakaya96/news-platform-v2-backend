-- Seed Data for News Platform
-- Run after schema.sql

-- Default admin user (password: admin123 - MUST change in production)
-- Hash is SHA-256 based, will be verified by the worker
INSERT OR IGNORE INTO users (email, password_hash, name, role)
VALUES ('admin@newsplatform.com', '$2b$10$8K1p/ZKqgfuO6Ry4A0vCzOQxRfSdghijklmnopqrstuABCDEFGH', 'Admin User', 'admin');

-- Categories
INSERT OR IGNORE INTO categories (name, slug, description, color, sort_order) VALUES
    ('Technology', 'technology', 'Latest in tech, AI, and innovation', '#3b82f6', 1),
    ('World News', 'world-news', 'Breaking stories from around the globe', '#ef4444', 2),
    ('Economy', 'economy', 'Markets, business, and financial news', '#10b981', 3),
    ('Sports', 'sports', 'Scores, analysis, and sports coverage', '#f59e0b', 4),
    ('Science', 'science', 'Discoveries, research, and breakthroughs', '#8b5cf6', 5),
    ('Health', 'health', 'Wellness, medicine, and public health', '#ec4899', 6),
    ('Entertainment', 'entertainment', 'Culture, movies, music, and celebrities', '#f97316', 7),
    ('Politics', 'politics', 'Government, policy, and political analysis', '#6366f1', 8);

-- Sample News Articles
INSERT OR IGNORE INTO news (title, slug, excerpt, content, image_url, image_alt, category_id, author_id, status, is_featured, is_breaking, seo_title, seo_description, published_at) VALUES

-- Technology
('OpenAI Unveils GPT-5: A New Era of Artificial Intelligence', 'openai-unveils-gpt-5-new-era-ai',
'OpenAI has announced the release of GPT-5, their most advanced language model yet, featuring unprecedented reasoning capabilities and multimodal understanding.',
'<h2>A Quantum Leap in AI Capability</h2><p>OpenAI has officially unveiled GPT-5, the latest iteration of their groundbreaking language model series. The new model demonstrates remarkable improvements across all benchmarks, with particular strength in mathematical reasoning, code generation, and creative writing.</p><p>According to OpenAI CEO Sam Altman, GPT-5 represents "a fundamental shift in what AI systems can accomplish." The model features a context window of up to 1 million tokens and can process images, audio, and video alongside text.</p><h3>Key Improvements</h3><ul><li><strong>Reasoning:</strong> 40% improvement on mathematical benchmarks</li><li><strong>Code Generation:</strong> Passes 95% of software engineering interviews</li><li><strong>Multimodal:</strong> Native support for images, audio, and video</li><li><strong>Speed:</strong> 2x faster inference compared to GPT-4 Turbo</li></ul><p>Industry experts predict this release will accelerate AI adoption across healthcare, education, and enterprise sectors.</p>',
'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200',
'AI Technology Concept',
1, 1, 'published', 1, 1,
'GPT-5 Released: OpenAI Launches Most Advanced AI Model Yet',
'OpenAI unveils GPT-5 with unprecedented reasoning, 1M token context, and native multimodal capabilities.',
'2025-01-15 09:00:00'),

-- World News
('Global Climate Summit Reaches Historic Agreement on Emissions', 'global-climate-summit-historic-agreement',
'World leaders have reached a landmark agreement at the Global Climate Summit, committing to 60% emission reductions by 2035.',
'<h2>A Turning Point for Climate Action</h2><p>In what many are calling the most significant climate agreement since Paris 2015, over 190 nations have committed to reducing greenhouse gas emissions by 60% from 2005 levels by 2035.</p><p>The agreement, reached after two weeks of intense negotiations, includes binding commitments for developed nations and a $500 billion annual climate finance package for developing countries.</p><h3>Key Commitments</h3><ul><li><strong>Emissions Target:</strong> 60% reduction by 2035</li><li><strong>Climate Finance:</strong> $500 billion annually for developing nations</li><li><strong>Renewable Energy:</strong> 80% clean electricity by 2030</li><li><strong>Deforestation:</strong> Net-zero deforestation by 2030</li></ul><p>Environmental groups have cautiously welcomed the agreement while emphasizing the need for immediate implementation.</p>',
'https://images.unsplash.com/photo-1569163139394-de4e4f3f5fd7?w=1200',
'Climate Summit Meeting',
2, 1, 'published', 1, 0,
'Historic Climate Agreement: 190 Nations Commit to 60% Emission Cuts',
'World leaders reach landmark climate agreement with binding 60% emission reduction targets and $500B finance package.',
'2025-01-14 14:30:00'),

-- Economy
('Federal Reserve Signals Multiple Rate Cuts in 2025', 'federal-reserve-signals-rate-cuts-2025',
'The Federal Reserve has indicated it may implement up to four interest rate cuts in 2025 as inflation continues to cool.',
'<h2>Dovish Shift in Monetary Policy</h2><p>Federal Reserve Chair Jerome Powell signaled a significant shift in monetary policy during his latest press statement, indicating that the central bank is prepared to begin cutting interest rates as early as March 2025.</p><p>The announcement sent stock markets to new all-time highs, with the S&P 500 surging 2.3% in afternoon trading. Bond yields fell sharply, with the 10-year Treasury dropping below 3.8%.</p><h3>Market Impact</h3><ul><li><strong>S&P 500:</strong> +2.3% to new all-time high</li><li><strong>NASDAQ:</strong> +3.1%, led by tech stocks</li><li><strong>10-Year Treasury:</strong> Dropped to 3.78%</li><li><strong>Dollar Index:</strong> Fell 1.2% against major currencies</li></ul><p>Economists now expect four 25-basis-point cuts throughout 2025, bringing the federal funds rate to the 4.25-4.50% range by year end.</p>',
'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200',
'Stock Market Charts',
3, 1, 'published', 0, 0,
'Fed Signals 4 Rate Cuts in 2025: Markets Surge to Record Highs',
'Federal Reserve indicates multiple rate cuts coming in 2025 as inflation cools, sending stocks to all-time highs.',
'2025-01-13 16:00:00'),

-- Sports
('Liverpool Extends Premier League Lead with Dominant Derby Win', 'liverpool-extends-premier-league-lead-derby',
'Liverpool secured a commanding 3-0 victory over Everton in the Merseyside derby, extending their Premier League lead to seven points.',
'<h2>Reds Dominate Merseyside</h2><p>Liverpool produced a masterclass performance at Anfield, dismantling Everton 3-0 to extend their lead at the top of the Premier League table to seven points.</p><p>Mohamed Salah opened the scoring with a stunning curling effort in the 23rd minute, before Darwin Nunez doubled the lead before halftime. Cody Gakpo sealed the victory with a late strike.</p><h3>Match Highlights</h3><ul><li><strong>23\'"</strong> - Mohamed Salah (assist: Trent Alexander-Arnold)</li><li><strong>41\'"</strong> - Darwin Nunez (assist: Mohamed Salah)</li><li><strong>87\'"</strong> - Cody Gakpo (assist: Dominik Szoboszlai)</li></ul><p>Liverpool now sit seven points clear of Arsenal, who have a game in hand, as the title race intensifies.</p>',
'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1200',
'Football Stadium',
4, 1, 'published', 0, 0,
'Liverpool 3-0 Everton: Reds Extend Premier League Lead',
'Liverpool dominate Merseyside derby with goals from Salah, Nunez, and Gakpo to extend Premier League lead.',
'2025-01-12 20:00:00'),

-- Science
('NASA Confirms Water Ice Discovery on Mars Surface', 'nasa-confirms-water-ice-mars-surface',
'NASA scientists have confirmed the discovery of accessible water ice deposits on the Martian surface, a breakthrough for future colonization efforts.',
'<h2>Water on Mars: Confirmed</h2><p>NASA\'s Mars Reconnaissance Orbiter has confirmed the presence of significant water ice deposits at shallow depths in multiple locations near the Martian equator.</p><p>The discovery, published in the journal Nature, has profound implications for future human missions and potential colonization of Mars. The ice deposits are estimated to contain enough water to support a small settlement for decades.</p><h3>Key Findings</h3><ul><li><strong>Location:</strong> Multiple sites near the Martian equator</li><li><strong>Depth:</strong> As shallow as 1 meter below the surface</li><li><strong>Volume:</strong> Estimated 10,000+ cubic meters per site</li><li><strong>Purity:</strong> High-purity water ice with minimal contamination</li></ul><p>Space agencies worldwide are now reassessing their Mars mission timelines in light of this discovery.</p>',
'https://images.unsplash.com/photo-1614728263952-84ea256f9679?w=1200',
'Mars Surface',
5, 1, 'published', 0, 0,
'NASA Confirms Water Ice on Mars: Breakthrough for Colonization',
'NASA confirms accessible water ice deposits on Mars surface near equator, a major breakthrough for future colonization.',
'2025-01-11 11:00:00'),

-- Health
('Breakthrough Cancer Vaccine Shows 90% Efficacy in Clinical Trials', 'breakthrough-cancer-vaccine-90-percent-efficacy',
'A new mRNA-based cancer vaccine has shown remarkable 90% efficacy in preventing cancer recurrence in phase 3 clinical trials.',
'<h2>Revolutionary Cancer Prevention</h2><p>Pharmaceutical company Moderna has announced that their personalized mRNA cancer vaccine has achieved a 90% efficacy rate in preventing melanoma recurrence in phase 3 clinical trials, marking a potential paradigm shift in cancer treatment.</p><p>The vaccine, known as mRNA-4157, works by training the immune system to recognize and attack cancer-specific mutations unique to each patient\'s tumor.</p><h3>Trial Results</h3><ul><li><strong>Efficacy:</strong> 90% reduction in cancer recurrence</li><li><strong>Patients:</strong> 6,500 participants across 200 sites</li><li><strong>Duration:</strong> 3-year follow-up data</li><li><strong>Side Effects:</strong> Comparable to COVID-19 mRNA vaccines</li></ul><p>The FDA is expected to fast-track approval, with the vaccine potentially available by mid-2025.</p>',
'https://images.unsplash.com/photo-1579165466741-7f35e4755660?w=1200',
'Medical Research',
6, 1, 'published', 0, 0,
'Cancer Vaccine 90% Effective: mRNA Breakdown in Clinical Trials',
'Moderna mRNA cancer vaccine shows 90% efficacy preventing melanoma recurrence in landmark phase 3 trials.',
'2025-01-10 08:00:00'),

-- Economy (second article)
('Bitcoin Surges Past $120,000 as Institutional Adoption Accelerates', 'bitcoin-surges-past-120000-institutional-adoption',
'Bitcoin has reached an all-time high above $120,000 as major financial institutions continue to embrace cryptocurrency.',
'<h2>Crypto Goes Mainstream</h2><p>Bitcoin has shattered its previous all-time high, surging past $120,000 as a wave of institutional adoption continues to drive demand for the world\'s largest cryptocurrency.</p><p>The rally has been fueled by several factors, including the approval of spot Bitcoin ETFs, increasing corporate treasury allocations, and growing acceptance as a legitimate asset class.</p><h3>What\'s Driving the Rally</h3><ul><li><strong>ETF Inflows:</strong> $50B+ in cumulative inflows since approval</li><li><strong>Corporate Adoption:</strong> Fortune 500 companies adding BTC to balance sheets</li><li><strong>Halving Effect:</strong> Supply reduction impact continuing</li><li><strong>Macro Environment:</strong> Rate cut expectations boosting risk assets</li></ul><p>Analysts are now debating whether Bitcoin could reach $200,000 by the end of 2025.</p>',
'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1200',
'Bitcoin Cryptocurrency',
3, 1, 'published', 0, 1,
'Bitcoin Price Surpasses $120K: Institutional Crypto Adoption Soars',
'Bitcoin reaches new all-time high above $120,000 driven by institutional adoption and ETF inflows.',
'2025-01-09 12:00:00'),

-- Technology (second article)
('Apple Vision Pro 2 Announced with Revolutionary Spatial Computing', 'apple-vision-pro-2-spatial-computing',
'Apple has unveiled the second generation of its mixed reality headset, featuring breakthrough display technology and a more accessible price point.',
'<h2>The Future of Computing</h2><p>Apple has officially announced the Vision Pro 2, the successor to its groundbreaking mixed reality headset. The new device features micro-OLED displays with 8K resolution per eye, a 50% wider field of view, and a significantly reduced price of $2,499.</p><p>Perhaps most notably, the Vision Pro 2 weighs just 350 grams – half the weight of its predecessor – making it comfortable for extended use sessions.</p><h3>Key Upgrades</h3><ul><li><strong>Display:</strong> 8K micro-OLED per eye, 120Hz refresh rate</li><li><strong>Field of View:</strong> 120 degrees (up from 80)</li><li><strong>Weight:</strong> 350g (50% lighter)</li><li><strong>Price:</strong> $2,499 (reduced from $3,499)</li><li><strong>Battery:</strong> 4 hours continuous use</li></ul><p>Pre-orders open in March, with shipping expected to begin in April 2025.</p>',
'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=1200',
'VR Headset Technology',
1, 1, 'published', 0, 0,
'Apple Vision Pro 2: 8K Display, Half the Weight, $2,499',
'Apple unveils Vision Pro 2 with 8K micro-OLED displays, 120° FOV, 350g weight, and $2,499 price point.',
'2025-01-08 19:00:00'),

-- Politics
('EU Passes Comprehensive AI Regulation Framework', 'eu-passes-ai-regulation-framework',
'The European Union has passed the world\'s most comprehensive AI regulation, setting global standards for artificial intelligence governance.',
'<h2>EU Leads on AI Governance</h2><p>The European Parliament has voted overwhelmingly in favor of the AI Act, making the EU the first major jurisdiction to implement comprehensive regulation of artificial intelligence systems.</p><p>The landmark legislation establishes a risk-based framework that categorizes AI applications by their potential impact on society, with strict requirements for high-risk systems.</p><h3>Regulation Tiers</h3><ul><li><strong>Unacceptable Risk:</strong> Banned (social scoring, manipulative AI)</li><li><strong>High Risk:</strong> Strict requirements (healthcare, law enforcement, hiring)</li><li><strong>Limited Risk:</strong> Transparency requirements (chatbots, deepfakes)</li><li><strong>Minimal Risk:</strong> No restrictions (spam filters, video games)</li></ul><p>Tech companies have 24 months to comply with most provisions, with some high-risk AI systems given 36 months.</p>',
'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200',
'EU Parliament',
8, 1, 'published', 0, 0,
'EU AI Act: World\'s Most Comprehensive AI Regulation Passed',
'European Union passes landmark AI Act establishing risk-based framework for artificial intelligence governance.',
'2025-01-07 15:00:00'),

-- Entertainment
('Oscar Nominations Announced: Sci-Fi Epic Leads with 12 Nods', 'oscar-nominations-sci-fi-epic-12-nods',
'This year\'s Oscar nominations have been announced, with the sci-fi epic "Stellar Horizons" leading the pack with an impressive 12 nominations.',
'<h2>Awards Season Heats Up</h2><p>The Academy of Motion Picture Arts and Sciences has announced this year\'s Oscar nominations, with the science fiction epic "Stellar Horizons" dominating with 12 nominations, including Best Picture and Best Director.</p><p>The film, directed by Christopher Nolan, has been both a critical and commercial success, grossing over $1.2 billion worldwide.</p><h3>Top Nominated Films</h3><ul><li><strong>Stellar Horizons</strong> – 12 nominations</li><li><strong>The Last Letter</strong> – 9 nominations</li><li><strong>Breaking Ground</strong> – 8 nominations</li><li><strong>Silent Echo</strong> – 7 nominations</li><li><strong>The Garden</strong> – 6 nominations</li></ul><p>The ceremony will take place on March 2, 2025, at the Dolby Theatre in Los Angeles.</p>',
'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200',
'Cinema Theater',
7, 1, 'published', 0, 0,
'Oscars 2025: Sci-Fi Epic "Stellar Horizons" Leads with 12 Nominations',
'Christopher Nolan\'s "Stellar Horizons" leads Oscar nominations with 12 nods including Best Picture and Best Director.',
'2025-01-06 10:00:00');

-- Tags
INSERT OR IGNORE INTO tags (name, slug) VALUES
    ('AI', 'ai'),
    ('Climate', 'climate'),
    ('Finance', 'finance'),
    ('Football', 'football'),
    ('NASA', 'nasa'),
    ('Medical', 'medical'),
    ('Apple', 'apple'),
    ('EU', 'eu'),
    ('Oscars', 'oscars'),
    ('Bitcoin', 'bitcoin');

-- News-Tag associations
INSERT OR IGNORE INTO news_tags (news_id, tag_id) VALUES
    (1, 1),  -- GPT-5 -> AI
    (2, 2),  -- Climate -> Climate
    (3, 3),  -- Fed -> Finance
    (4, 4),  -- Liverpool -> Football
    (5, 5),  -- Mars -> NASA
    (6, 6),  -- Cancer -> Medical
    (7, 10), -- Bitcoin -> Bitcoin
    (7, 3),  -- Bitcoin -> Finance
    (8, 7),  -- Apple -> Apple
    (9, 8),  -- EU -> EU
    (9, 1),  -- EU -> AI
    (10, 9); -- Oscars -> Oscars
