"""Second-pass additions that turn corpus_data into a realistic multi-chunk corpus (documents of roughly 1,100 words, so
3-5 chunks at the production chunk size of 512 tokens). All text is invented for testing.

EXTRA     topic id -> a second paragraph (worked example / common mistake / link to another topic).
Q2        topic id -> a differently phrased question (paraphrase, no shared keywords where possible).
PRIVATE   documents that must NEVER be retrievable by anyone but their owner (privacy canaries).
"""
EXTRA = {
    "bio_cells": "A common mistake is to say that prokaryotes have no DNA. They do; it is simply not enclosed. Bacteria such as E. coli are about one to two micrometres long, roughly a tenth of the diameter of a typical animal cell, and they divide by binary fission rather than mitosis.",
    "bio_membrane": "Cholesterol sits between the phospholipids of animal cell membranes and stops them packing too tightly in the cold or becoming too fluid when warm. Glycoproteins on the outer surface act as receptors and as markers that let cells recognise each other, which matters for the immune system.",
    "bio_osmosis": "To investigate osmosis a student can weigh potato cylinders before and after leaving them in sucrose solutions of different concentration. The cylinders gain mass in dilute solutions and lose mass in concentrated ones, and the concentration at which there is no change estimates the water potential of the potato cells.",
    "bio_active": "Cells that absorb glucose from the gut use co-transport: sodium ions move down their gradient into the cell and carry glucose with them. The gradient is maintained by the pump, so the process depends indirectly on ATP. Cells with many mitochondria, such as those lining the intestine, are specialised for this.",
    "bio_respiration": "Anaerobic respiration is much less efficient, giving only two ATP per glucose. Animal muscle cells produce lactate, which causes the burning feeling during hard exercise, whereas yeast produces ethanol and carbon dioxide, the basis of brewing and baking. The oxygen debt is repaid after exercise.",
    "bio_photo": "Limiting factors control the rate of photosynthesis: light intensity, carbon dioxide concentration and temperature. At low light the rate rises in proportion to light, but once another factor is limiting the curve levels off. Chlorophyll absorbs mostly red and blue light and reflects green, which is why leaves look green.",
    "bio_enzymes": "Competitive inhibitors resemble the substrate and block the active site, so adding more substrate can overcome them, whereas non-competitive inhibitors bind elsewhere and change the shape of the active site. Amylase breaks down starch, protease breaks down proteins and lipase breaks down fats during digestion.",
    "bio_cellcycle": "Cancer is uncontrolled cell division that happens when checkpoints in the cell cycle fail. Mutations in genes that normally slow division, or in genes that promote it, allow cells to keep dividing and form a tumour. Stem cells, by contrast, divide by mitosis and can differentiate into specialised cells.",
    "bio_microscopy": "Worked example: an image of a cell measures thirty millimetres across and the magnification is times three hundred, so the actual width is thirty divided by three hundred, which is point one millimetre or one hundred micrometres. Always convert units before calculating and show the formula in an exam answer.",
    "bio_organelles": "Protein destined to leave the cell follows a route: made on ribosomes at the rough endoplasmic reticulum, packaged into vesicles, modified in the Golgi apparatus, then carried in secretory vesicles to the cell surface membrane for exocytosis. Cells that secrete enzymes, such as in the pancreas, have extensive Golgi.",
    "gen_dna": "Chargaff found that the amount of adenine equals thymine and guanine equals cytosine in any sample. Given that a sample has thirty percent adenine, it must also have thirty percent thymine, leaving forty percent shared equally between guanine and cytosine, twenty percent each.",
    "gen_replication": "The Meselson and Stahl experiment grew bacteria in heavy nitrogen and then transferred them to light nitrogen. After one generation all the DNA was of intermediate density, which ruled out conservative replication and supported the semi-conservative model, where each new molecule keeps one old strand.",
    "gen_transcription": "The template strand is read three-prime to five-prime, so the mRNA is built five-prime to three-prime and has the same sequence as the coding strand except that thymine is replaced by uracil. In bacteria, which have no nucleus, translation can begin before transcription has finished.",
    "gen_translation": "The genetic code is degenerate, meaning that most amino acids are coded for by more than one codon, and it is universal, with nearly all organisms using the same code. A chain of amino acids folds into a protein whose shape depends on its sequence, and the sequence is determined by the order of codons.",
    "gen_mutation": "Not every mutation changes a protein: a silent mutation changes a codon to another codon for the same amino acid. Mutagens such as ultraviolet light, X-rays and some chemicals increase the mutation rate. Sickle cell carriers have some resistance to malaria, an example of a mutation that persists because it helps survival.",
    "gen_mendel": "Worked example: crossing a heterozygous tall pea plant Tt with another Tt gives offspring TT, Tt, Tt and tt in a Punnett square, so three quarters are tall and one quarter are short. A test cross with a homozygous recessive parent reveals whether a tall plant is homozygous or heterozygous.",
    "gen_meiosis": "Mitosis and meiosis are often confused. Mitosis makes two identical diploid cells for growth and repair with one division, whereas meiosis makes four different haploid cells for sexual reproduction with two divisions. Non-disjunction, where chromosomes fail to separate, causes conditions such as Down syndrome.",
    "gen_selection": "Antibiotic resistance spreads by natural selection: a random mutation lets a bacterium survive a drug, the rest die, and the resistant bacteria multiply and pass the gene on, even to other species through plasmids. Finishing a course of antibiotics and using them only when needed slows this process.",
    "gen_speciation": "Darwin's finches on the Galapagos Islands illustrate this process, with beak shapes adapted to different foods on different islands. Sympatric speciation, where new species arise in the same area, is rarer and can happen quickly in plants through polyploidy, when the chromosome number doubles.",
    "gen_engineering": "Genetically modified crops such as golden rice carry extra genes for vitamin A, and some crops are made resistant to pests. Critics raise concerns about gene flow to wild relatives and ownership of seed, while supporters point to higher yields. Gene therapy attempts to replace a faulty allele in a patient's cells.",
    "cs_bigo": "To compare algorithms, drop constants and lower-order terms: a loop that does three n plus ten steps is O(n). Nested loops over the same input usually give O(n squared), and doubling the input of a quadratic algorithm makes it about four times slower. Space complexity measures memory in the same way.",
    "cs_binary": "Worked example: searching for 23 in the sorted list 2, 5, 8, 12, 16, 23, 38 compares with 12 first, discards the left half, then compares with 23 and succeeds after two checks. A list of one million items needs at most about twenty comparisons, compared with up to one million for a linear search.",
    "cs_sorting": "Stable sorting algorithms keep equal elements in their original order, which matters when sorting records by several keys. Insertion sort is fast on nearly sorted data, merge sort needs extra memory proportional to the input, and quicksort sorts in place. Python's built-in sort uses Timsort, a hybrid of merge and insertion sort.",
    "cs_stackqueue": "Checking that brackets in an expression are balanced uses a stack: push every opening bracket and pop when a closing bracket arrives, and the expression is balanced if the stack is empty at the end. A circular queue reuses a fixed array by wrapping the head and tail indices around the end.",
    "cs_linked": "Because nodes are not stored together, a linked list uses extra memory for pointers and has poor cache behaviour compared with an array, but it never needs to be resized or shifted when items are inserted in the middle. Reversing a singly linked list is a classic exercise that needs three pointers.",
    "cs_hash": "A good hash function spreads keys evenly and is fast to compute. The load factor, the number of items divided by the number of slots, controls performance: when it grows beyond about 0.7 the table is resized and every key is rehashed. Python dictionaries and sets are implemented as hash tables.",
    "cs_trees": "Searching a balanced binary search tree takes O(log n) time, but inserting sorted data into an unbalanced one produces a chain and degrades to O(n). Heaps are a different tree that always keeps the largest or smallest value at the root and are used to build priority queues.",
    "cs_graphs": "Social networks, road maps and the internet are graphs. A graph can be stored as an adjacency matrix, quick to check for an edge but wasteful for sparse graphs, or as adjacency lists, which use memory proportional to the number of edges. Topological sort orders the tasks of a directed acyclic graph.",
    "cs_recursion": "Recursion can always be replaced with a loop and an explicit stack. Naive recursive Fibonacci recomputes the same values exponentially many times, which is why dynamic programming helps. Tail recursion lets some languages reuse the same stack frame, although Python does not optimise it.",
    "cs_dp": "The knapsack and longest common subsequence problems are standard examples. Bottom-up dynamic programming fills a table from the smallest subproblems upward and avoids recursion, whereas top-down memoisation caches results as the recursion discovers them. Greedy algorithms make locally best choices and do not always find the optimum.",
    "net_osi": "A message is wrapped in a new header at each layer on the way down the sender's stack, a process called encapsulation, and unwrapped on the way up the receiver's. The practical TCP/IP model has four layers: link, internet, transport and application, and most real protocols map to it more directly than to OSI.",
    "net_tcp": "TCP also uses sequence numbers, acknowledgements and retransmission to guarantee delivery, and flow control to stop a fast sender overwhelming a slow receiver. Because UDP has no handshake it suits DNS lookups, streaming and online games, where an occasional lost packet matters less than delay.",
    "net_dns": "A DNS lookup asks a recursive resolver, which asks a root server, then the top-level domain server, then the domain's authoritative server, and caches the answer for the record's time to live. Using a cached answer is why changing a DNS record can take hours to reach every user.",
    "net_http": "Status codes are grouped: 2xx success, 3xx redirection, 4xx client error and 5xx server error, so 403 means forbidden and 301 means moved permanently. Cookies let a stateless protocol remember a user, and HTTPS protects the content, though not the fact that a connection was made to a particular site.",
    "db_sql": "Worked example: SELECT name, grade FROM students JOIN results ON students.id = results.student_id WHERE grade > 70 ORDER BY grade DESC lists high achievers. An INNER JOIN keeps only matching rows, while a LEFT JOIN keeps every row from the left table and fills missing values with NULL.",
    "db_norm": "A table that stores a customer's address in every order row repeats data, so changing an address needs many updates and invites inconsistency. Moving addresses into a customer table and linking with a foreign key fixes this. Over-normalising can slow queries, so some systems deliberately denormalise for speed.",
    "db_acid": "A bank transfer is the classic example: subtracting from one account and adding to another must either both happen or neither, which is atomicity. If the server crashes after commit the transfer must still be there, which is durability, usually achieved with a write-ahead log.",
    "db_index": "Indexing a column that is often used in WHERE clauses or joins can turn a scan of millions of rows into a few page reads. Indexing every column wastes space and slows writes, and an index is not used when a query applies a function to the column or matches a pattern beginning with a wildcard.",
    "sec_crypto": "Real systems combine both: TLS uses asymmetric encryption to agree a shared key and then symmetric encryption for speed. Passwords should be stored as salted hashes using a slow algorithm such as bcrypt, never as plain text or reversible encryption. A digital signature proves who sent a message and that it was not altered.",
    "os_deadlock": "Two processes each holding a resource the other needs is the textbook case. It can be prevented by breaking one of the four conditions, for example by requiring resources to be requested in a fixed order, which removes circular wait. Starvation is different: a process never gets the processor even though no deadlock exists.",
    "ch_atom": "Worked example: chlorine has atomic number seventeen and chlorine-35 and chlorine-37 are its isotopes, which is why its relative atomic mass is about 35.5, a weighted average of the isotopes. Isotopes have the same chemical properties because they have the same number of electrons, but they differ slightly in mass.",
    "ch_periodic": "Reactivity increases down group one because the outer electron is further from the nucleus and more shielded, so it is lost more easily, whereas it decreases down group seven because an incoming electron is held less strongly. Mendeleev left gaps in his table for elements that had not yet been discovered.",
    "ch_ionic": "Sodium chloride forms when sodium gives one electron to chlorine, giving Na plus and Cl minus. Ionic compounds are brittle because a blow shifts layers so that like charges meet and repel, and many dissolve in water because the water molecules attract the ions. Solid ionic compounds do not conduct because the ions cannot move.",
    "ch_covalent": "Dot-and-cross diagrams show shared pairs: in methane carbon shares four pairs with four hydrogens and in carbon dioxide there are two double bonds. Diamond and graphite are both carbon, but graphite has layers with delocalised electrons so it conducts electricity and is soft, whereas diamond is hard and does not conduct.",
    "ch_metallic": "Alloys such as steel and brass are harder than pure metals because atoms of a different size distort the regular layers and stop them sliding. Metals are shiny because the free electrons reflect light, and they are good conductors of heat because the electrons carry energy through the lattice.",
    "ch_moles": "Worked example: the relative formula mass of water is eighteen, so thirty-six grams is two moles, which contains twice the Avogadro number of molecules. Concentration is measured in moles per cubic decimetre, and the number of moles in a solution is concentration multiplied by volume in decimetres cubed.",
    "ch_acids": "Indicators change colour with pH: universal indicator is red in strong acid, green when neutral and purple in strong alkali. Titration finds the concentration of an unknown acid by adding alkali from a burette until the indicator changes. Acids react with metals to give a salt and hydrogen, and with carbonates to give a salt, water and carbon dioxide.",
    "ch_rates": "Worked example: crushing a marble chip increases its surface area, so more particles are exposed and the reaction with acid is faster, even though the total amount of gas produced is the same. A catalyst provides an alternative pathway with lower activation energy and is not used up, which is why industry uses them.",
    "ch_equilibrium": "In the Haber process a higher pressure favours ammonia because there are fewer gas molecules on the right, and a lower temperature favours it because the forward reaction is exothermic, but too low a temperature makes the rate unacceptably slow, so about 450 degrees Celsius with an iron catalyst is used as a compromise.",
    "ch_electrolysis": "Aluminium oxide is dissolved in molten cryolite to lower the melting point and save energy, and the carbon anodes burn away and must be replaced. In the electrolysis of brine, chlorine forms at the anode, hydrogen at the cathode and sodium hydroxide is left in the solution, all valuable industrial products.",
}

Q2 = {
    "bio_cells": "Which type of cell keeps its genetic material inside a nucleus?",
    "bio_osmosis": "Why does a plant cell become firm when placed in pure water?",
    "bio_active": "How do cells move ions uphill against their gradient?",
    "bio_respiration": "How much ATP does one glucose molecule yield with oxygen?",
    "bio_photo": "Which enzyme fixes carbon dioxide in the stroma of a chloroplast?",
    "bio_enzymes": "What happens to the active site when an enzyme is heated too much?",
    "bio_cellcycle": "In which phase of interphase is the DNA copied?",
    "gen_dna": "Which bases pair together in a DNA molecule?",
    "gen_replication": "Which enzyme joins the short pieces on the lagging strand?",
    "gen_mutation": "What kind of base change causes the haemoglobin disorder sickle cell anaemia?",
    "gen_meiosis": "Why are the gametes produced by meiosis all different from each other?",
    "gen_engineering": "Why can bacteria be made to produce a human protein?",
    "cs_binary": "What is the time complexity of searching a sorted array by halving it?",
    "cs_sorting": "Which sorting algorithm has quadratic behaviour when pivots are badly chosen?",
    "cs_hash": "What can you do when two keys map to the same slot?",
    "cs_trees": "In what order does an in-order traversal return the values of a binary search tree?",
    "cs_graphs": "How can the cheapest route between two nodes with weighted edges be found?",
    "net_tcp": "Which protocol sets up a connection with SYN, SYN-ACK and ACK?",
    "net_http": "What does a server mean when it returns a 404 code?",
    "db_norm": "What does it mean for a table to be in 3NF?",
    "sec_crypto": "Which kind of encryption uses a public key and a private key?",
    "os_deadlock": "What four things must be true for processes to deadlock?",
    "ch_atom": "What do we call atoms with the same atomic number but different mass numbers?",
    "ch_ionic": "Why will molten sodium chloride carry a current when the solid will not?",
    "ch_acids": "How does hydrochloric acid differ from ethanoic acid in water?",
    "ch_equilibrium": "What happens to a system at equilibrium when the pressure is raised?",
}

# Visibility canaries. Each has a unique phrase that appears nowhere else; a question built from it is asked by
# users who must NOT be able to retrieve it.
PRIVATE = {
    "student-a-private-notes.docx": {
        "module": "BIO", "owner": "student", "visibility": "personal",
        "topics": [
            ("priv_student_exam", "My private revision plan: the biology mock exam is on the fourteenth of March, and I am keeping the codeword PERSONAL-CANARY-LLAMA-5503 for my own notes. I always confuse the Calvin cycle with the Krebs cycle and need to practise drawing both.", "When is my private biology mock exam and what is my revision codeword?"),
            ("priv_student_mnemonic", "Mnemonic I invented for the stages of mitosis: Please Make Another Two cells, for prophase, metaphase, anaphase and telophase. This is only for me and not part of the course material.", "What mnemonic did I invent for the stages of mitosis?"),
        ],
    },
    "lecturer-private-draft.docx": {
        "module": "BIO", "owner": "lecturer", "visibility": "personal",
        "topics": [
            ("priv_lecturer_exam", "Draft exam paper, not released to students: question one asks for the definition of osmosis, question two asks for a labelled diagram of a mitochondrion, and the unreleased marking scheme codeword is LECTURER-CANARY-OTTER-8820. Do not share before the exam board approves.", "What is on the unreleased draft exam paper and its marking scheme codeword?"),
        ],
    },
}
