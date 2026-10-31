---
litzio: 1
numbering:
  headings: false
  title: false
---

# Key Messages - Models for the Smart Grid

Models aid our understanding of interoperability and other smart grid concerns, and facilitate common language and communication across stakeholders. Evolution in technology and grid architecture in recent years requires an update of these tools.

The NIST Smart Grid Conceptual Model reflects technology and platform-driven capabilities emerging in the Customer and Distribution Domains, as well as the structural reorganization of a system that is more reliant on distributed resources.

Communication Pathways Scenarios are presented to help stakeholders examine how interface requirements might change with different system architectures or control strategies. These scenarios are not mutually exclusive and allow users to visually examine interoperability considerations that might arise through decisions on technology, operations, or economic structure.

Communications challenges increase with grid complexity, which adds risk to everything from stakeholder engagement to equipment procurement. An ontology for the smart grid is introduced to provide reference language that can be used to clarify communications.

# Models for the Smart Grid

Several models have been developed by NIST to describe interoperability concerns in the smart grid. In this version of the Framework, these models are updated and expanded to reflect emerging power system trends. An ontology for the smart grid is also described, which can be used to model functional and requirements descriptions for actors and equipment across the grid.

# 2.1. NIST Smart Grid Conceptual Model

The NIST Smart Grid Conceptual Model describes the overall composition of electric grid systems and applications. It is meant to provide a high-level view of the system that can be understood by many stakeholders. Originally introduced in 2010 \[74], the Conceptual Model is updated with each Framework revision. The Smart Grid Conceptual Model update in this document (see Figure 4 ) reflects large increases in the number and types of distributed energy resources (DERs) used throughout the grid, the increasing importance and automation of distribution systems, new customer interactions and assets, and the role of service providers in the distribution system.

:::{figure} pictures/picture-000.png
:alt: Smart Grid Conceptual Model; 20; Operations; Service; Provider; Markets; Distribution; Transmission; Customer; Secure Communication Flows; Generation including DER; Electrical Flows; Domain; Source: NIST Smart Grid Framework 4.0

Figure 4 - Updated NIST smart grid conceptual model
:::

The key Framework concepts derived from the updated Conceptual Model remain broadly similar to those of previous editions. First, the roles and responsibilities for actors and equipment in the electrical grid are a function of the domain in which they are applied. Through this lens we understand that functions required of grid equipment will likely change depending on the grid context, or domain, in which it is used. 9 Benefits associated with equipment, resource, or action will similarly vary with domain and other context.

Second, the Conceptual Model reinforces the contrast between the growing complexity of information exchange necessary to operate the grid, and the relatively straightforward physical exchanges of energy that actually are the grid. Producing or consuming electricity still relies on relatively few and simply physical connections, even as energy technologies diversify across the system and grid dynamics become less certain. Conversely, grid communications and data complexity are exploding as people leverage the proliferation of low-cost power electronics, sensors, and microchips to support grid operations through coordinated actions of small-scale and distributed devices - coordination that was once the exclusive purview of large generators in close proximity. 10 Whether to expand coordination of the high voltage system 11 or to prolong the life of existing distribution infrastructure, 12 information flows are increasing everywhere across the grid.

9 For example, a photovoltaic system installed at a single-family house may have significantly different operating parameters than ones installed at commercial facilities or used for bulk power generation.

## 2.1.1. Conceptual model updates

While the high-level concepts contained in the NIST Smart Grid Conceptual Model have proven robust with time, the grid is also changing rapidly. The Conceptual Model and its derivatives have been updated to reflect many changes throughout the system and explore the associated impact on system interoperability requirements. These changes include:

## Generation Domain

Changing scale - the domain name has been updated to Generation including DER to explicitly acknowledge the growing diversity in scale and utilization of grid resources.

Technology diversity - the number and types of generation technologies has been expanded, to reflect the growing diversity of U.S. generation assets \[7].

Physical siting - the Generation including DER domain has been elongated to represent the geographic and topological diversity of included technologies. Icons representing large scale generation technologies are physically closer to the Transmission domain, and smaller scale or more modular technologies are physically closer to the Distribution and Customer domains.

Customer participation - resources provided by the customer, whether generation or demand management, are included as one of the many resource options available in the Generation including DER domain (see Figure 37 ).

## Distribution Domain

Expanding role - the Distribution Domain has been made larger and placed more centrally within the Conceptual Model to reflect the growing responsibilities distribution systems have for optimizing grid function.

Improved sensing - sensing in distribution systems (represented by the icon of an overhead line fault detection device) is important to improving state awareness, a prerequisite for optimizing grid function.

Controllability and intelligence - computer servers represent the growing availability and use of real-time data for intelligent control of distribution grids.

10 For example, while energy imbalances between supply and demand used to only be managed by dispatching one of two large generators, today the same imbalance could also be addressed through the coordinated actions of many customers and their devices.

11 For example, the Western Energy Imbalance Market \[81]

12 For example, the Brooklyn Queens Demand Management Project \[78]

New actors - historically the province of distribution utilities, service providers and other actors are increasingly providing equipment to and services for the distribution grid as indicated by the new link between the Distribution and Service Provider Domains .

## Customer Domain

Distributed operations - with active energy management possible at the grid edge, operations, control and automation enter the customer domain as represented by the computer monitor replicated from the Operations Domain .

Customer diversification - from multi-family dwellings to commercial and industrial facilities and campuses, the Customer Domain has been updated to reflect many types of customers served by and interacting with the electrical grid and energy markets.

Even with these updates, the high-level Conceptual Model shown in Figure 4 is useful only for exploring the electrical and communications flows between grid domains. Much innovation occurs within the grid domains, the exploration of which improves understanding of the relationships between technology, communications, and interoperability. The Conceptual Model therefore includes detailed domain-specific examinations of smart grid roles, technologies, services, and information exchange, which are described in Section 2.1.2 and Appendix A - Smart Grid Conceptual Model Domains.

Underlying the Conceptual Model is a legal and regulatory framework that governs many aspects of the electrical grid. These regulations apply to actors and applications, and to their interactions, throughout the system and enable the implementation and management of policies and requirements that keep the power system safe, reliable, and cost effective while maximizing the public good. Organizations that adopt these regulations exist at several levels, from federal agencies to public utility commissions at the state and local levels.

The transition to a modern grid introduces new regulatory considerations, which may transcend jurisdictional boundaries and require increased coordination among federal, state, and local lawmakers and regulators. The Conceptual Model is intended to be a useful tool for regulators at all levels to assess how best to achieve public policy goals that, along with business objectives, motivate investments in modernizing the nation's electric power infrastructure.

## 2.1.2. Conceptual model domains

Each domain - and its sub-domains - in the Conceptual Model describe smart grid conceptual roles and services. They include types of services, interactions, and stakeholders that make decisions and exchange information necessary for performing tasks to achieve system goals, such as: customer and demand response management, distributed generation aggregation, and outage management. Services are performed by one or more roles within a domain. For example, corresponding services may include home automation, distributed energy resource (DER) and customer demand response, load control, and wide-area situational awareness (WASA).

Each of the seven NIST Smart Grid Conceptual Model domains is described in Table 1 .

:::{table} Table 1 - Domains and roles/services in the smart grid conceptual model

|   | Domain                   | Roles/Services in the Domain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| - | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Customer                 | The end users of electricity. May also generate, store, and manage the use of energy. Traditionally, three customer types are discussed, each with its own sub-domain: residential, commercial, and industrial.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2 | Markets                  | The facilitators and participants in electricity markets and other economic mechanisms used to drive action and optimize system outcomes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3 | Service Provider         | The organizations providing services to electrical customers and to utilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4 | Operations               | The managers of the movement of electricity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 5 | Generation Including DER | The producers of electricity. May also store energy for later distribution. This domain includes traditional generation sources and distributed energy resources (DER). At a logical level, 'generation' includes those traditional larger scale technologies usually attached to the transmission system, such as conventional thermal generation, large-scale hydro generation, and utility-scale renewable installations usually attached to transmission. DER is associated with generation, storage, and demand response provided in the customer and distribution domains, and with service provider-aggregated energy resources. |
| 6 | Transmission             | The carriers of high voltage electricity over long distances. May also store and generate electricity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7 | Distribution             | The distributors of electricity to and from customers. May also store and generate electricity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
:::

To enable smart grid functionality, the roles in a particular domain often interact with roles in other domains, as shown in Figure 4 . Moreover, as system complexity increases and communications and interoperability expand operational control beyond the locational specificity of physical connections, it is likely that organizations will contain components of multiple domains. For example, the Independent System Operators (ISOs) and Regional Transmission Organizations (RTOs) in North America have roles in both the markets and operations domains. Similarly, a distribution utility is not entirely contained within the distribution domain - it is likely to contain roles in the operations domain, and perhaps also the markets domain as economic signals become more dynamic across the system. Vertically integrated utilities will have roles in many domains.

Detailed descriptions and diagrams for each of the NIST Conceptual Model Domains are provided in Appendix A - Smart Grid Conceptual Model Domains.

## 2.1.3. Other services and financial markets

With its visual representation of domains, interfaces, and electrical and communications flows, the Conceptual Model supports a collective understanding of the actors, roles, and responsibilities needed to ensure effective day-to-day grid operations and control. The Model is an aid to understand how transitioning to a smart, interoperable grid may modify the expectations and roles of different system components or contributors. For example, with the updated Generation including DER, Operations, Distribution, and Customer Domains, the Conceptual model helps clarify emerging concerns and opportunities associated with the introduction of new customer-sited resources and increasingly distributed operations.

The Conceptual Model focuses on the key considerations of interfaces and interoperability and does not identify every possible concern related to the grid. For example, the financial roles defined in the Markets Domain are directly relevant to operations through pricing strategies or other economic activities that serve as proxies for system control signals. The roles of construction and associated financial services that are critical to the buildout of new grid infrastructure - but do not influence day-to-day operations and control - are included.

The Conceptual Model does not need to explicitly include every function related to the grid to maintain its value to help organize disparate stakeholders and provide a common conceptual foundation to advance interoperability. The Model allows extended concerns to be identified and understood in its context, thereby providing support for policy and planning activities from regional planning to resource adequacy assessments.

# 2.2. Communication Pathways Scenarios

The updated Smart Grid Conceptual Model provides a high-level set of descriptions adequate to include the broad set of evolving trends in the smart grid. Yet interoperability requirements derive from specific system and device interfaces that are not sufficiently characterized by such high-level depictions. In this section, another set of model diagrams - communication pathways diagrams - are provided wherein the domain structure of the Conceptual Model is used to facilitate a more detailed examination of system interfaces.

The Communication Pathways Scenario diagrams are an update and diversification of earlier mappings drawn to provide a visual reference for legacy applications and logical interfaces within the context of the Conceptual Model. Published in earlier Frameworks, the legacy applications mappings depicted an overarching architecture and provided a static perspective on the range of system and device interfaces. Building on the emerging diversity of grid architectures and associated system interfaces, the logical application model drawing has been updated into a series of Communication Pathways Scenario diagrams to depict specific interfaces and conceptual issues inspired by the DOE's reference grid architectures (see Section 1.3.1 ).

The architecturally inspired scenarios include:

· Legacy Communication Pathways Scenario

· High-DER Communication Pathways Scenario

· Microgrid Communication Pathways Scenario

· Hybrid Communication Pathways Scenario

These scenarios are not mutually exclusive. Rather, they represent views of the grid emphasizing various aspects. For example, many actors such as smart meters and advanced distribution systems appear in multiple reference models.

## 2.2.1. Graphic conventions

Each Communication Pathways Scenario diagram uses a common set of graphical conventions. For each diagram, colored boxes represent Conceptual Model Domains (see Table 2 ), and symbols are used to define actors, gateways, communications paths, and networks (see Table 3 ).

:::{table} Table 2 - Domain descriptions and graphical color representation

| Domain            | Domain Role/Service                                                                                                                                                                           | Color Code  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Operations        | The managers of the movement of electricity.                                                                                                                                                  | Blue        |
| Markets           | The operators and participants in electricity markets i.e. Independent System Operators (ISOs), Regional Transmission Organizations (RTOs), and Distribution System Operators (DSOs).         | Purple      |
| Distribution      | The distributors of electricity to and from customers.                                                                                                                                        | Light Brown |
| Transmission      | The carriers of bulk electricity over long distances.                                                                                                                                         | Maroon      |
| Generation        | Generators of electricity. Includes older generation sources such as coal and other carbon-based fuels, nuclear, hydro as well as distributed energy resources (DERs) such as wind and solar. | Plum        |
| Customer          | Residential, commercial, and industrial entities that use, produce, or store energy and interact with utilities, aggregators, and markets.                                                    | Orange      |
| Service Providers | Billing, Information Technology (IT), finance, procurement, regulatory and aggregation functions performed for electric grid stakeholders.                                                    | Green       |
:::

:::{table} Table 3 - Communication pathways diagrams symbol descriptions

| Symbol Name                      | Description                                                                                                                                | Symbol |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Comm. Network                    | A communication network carries analog and digital information from a physical location to other locations                                 |        |
| Roles and Actors                 | Roles comprise specific business activities and actors can perform multiple activities.                                                    |        |
| Gateway Role                     | Role that represents a border of the communication network.                                                                                |        |
| Comms. Path                      | A communications path shows the route that information flows within a Domain.                                                              |        |
| Comms. Path Changes Owner/Domain | A communications path that shows the route that information flows between domains and in some cases between the owners of the information. |        |
:::

:::{figure} pictures/picture-001.png
:::

:::{figure} pictures/picture-002.png
:::

:::{figure} pictures/picture-003.png
:::

:::{figure} pictures/picture-004.png
:::

:::{figure} pictures/picture-005.png
:::

The complexity of some scenario diagrams demands a simplified approach to portraying certain interfaces. When a communication pathway would likely interact with all domain or sub-domain actors in a similar manner, one pathway is drawn that terminates at the (sub-) domain boundary rather than cluttering the diagram with redundant individual communication pathways to each actor. Although prevalent in all scenarios, this technique is most evident in the High-DER Scenario through the simplified interactions of the operations sub-domains with the 'Operational Enterprise Service Bus' actor, and also in the simplified interactions of the Internet with each of the domains in Figure 6 .

## 2.2.2. The legacy communication pathways scenario

The Legacy Communication Pathways Scenario (see Figure 5 ) depicts the Conceptual Model mapping to the overarching electric grid architecture from the previous revision of the NIST Interoperability Framework \[24]. It serves as a baseline mapping that also depicts a structure representative of current electric grid systems. Domains and sub-domains show logical groupings of systems and applications. For example, transmission systems such as an Energy Management System (EMS) are shown in the transmission operations sub-domain within the operations domain.

The model also shows information flows and communications paths between systems. Communications paths describe interfaces where standards may be helpful in defining the required protocols and characteristics of information exchange, although the depiction in this diagram of any single communication pathway is not in-and-of-itself an indication that NIST supports standardization of that interface.

Sub-domains in the Legacy Scenario are shown to identify typical groupings within the utility business sector. The particular collection of elements (network, roles, actors, and gateway role) helps define a business 13 or department 14 in an illustrative fashion without being exhaustive.

13 For example: RTO/ISO, Utility Provider, or Third-Party Provider

14 For example: Transmission Operations, Distribution Operations

:::{figure} pictures/picture-006.png
:alt: Markets; Operations; Service Providers; Retailer /; RTO/ISO; Transmission; Distribution Ops; Utility; Third-Party; Wholesaler; Ops; Ops; Provider; Provider; DMS; Asset; Aggregator; EMS; EMS; WAMS; Demand; M9gmt; MDMS; CIS; Energy; Retail; CIS; Response; Billing; Provider; Billing; Energy; Service; Service; Service; Home / Building; Market; Integration; Integration; Integration; Manager; Clearinghouse; ISO/RTO; SCADA; RTO; Transmission; SCADA; Metering; System; Distribution; SCADA; Aggregator; Participant; Internet /; Others; Internet /; e-Business; e-Business; Services; Market; Wide Area; Field Area; Energy; Customer; EMS; Interface; Networks; Networks; Services; Interface; Data; Plant Control; Collector; Equipment; Customer; System; Substation; Substation; Field; Meter; Integration; Controller; Device; Premises; Generators; Networks; Distributed; Electric; Generation; Substation; Generation; Storage; Appliances; Device; Domain; Storage; Electric; Electric; Electric; Network; Storage; Vehicle; Thermostat; Roles and Actors; Transmission; Distributed; Gateway Role; Generation; Comms Path; Distribution; Customer; Comms Path Changes Owner / Domain; Distributed Energy Resources; Source: NIST Smart Grid Framework 3.0, 2014

Figure 5 - Legacy communication pathways scenario
:::

## 2.2.3. High-DER communication pathways scenario

The High-DER Communication Pathways Scenario (see Figure 6 ) represents current and future grids with DERs providing large amounts of power. In the future, market management functionality may be performed at both the distribution and transmission levels, and market makers such as Distribution System Operators (DSOs) will need to optimize for both economic factors and reliability.

As described in Section 1.1 , large increases in the number of DERs have occurred and are now much more common in electric grids. The contributions DER assets provide will transform over the coming years as new policy complements advancing technology. The Federal Energy Regulatory Commission's (FERC) recent Order 2222 \[82] removes barriers to market access that prevented DERs from competing on a level playing field with conventional resources providing a range of grid services \[83].

Distributed energy technologies are therefore not a special class of generation assets, but a typical asset that can use power generation or demand response to participate in balancing supply and demand in the electrical grid. Accordingly, DER assets can reside in numerous domains with numerous operational strategies. Some examples include:

Utility-owned DER assets: These assets reside in the Generation Domain and prioritize supporting conventional markets and grid infrastructure.

Customer-sited DER assets: These assets reside in the Customer Domain and may prioritize local or non-utility services or operational strategies over utility priorities. Although sited at the customer premises, these assets may be controlled by customers, third party aggregators, or utilities.

The High-DER Scenario in Figure 6 depicts a paradigm where market signals can be sent over the Internet to both distribution utilities or DSOs and to customers who own DERs. In this way, non-utility assets can participate and respond to the same market or other economic incentives as conventional resources. These capabilities are key enablers of many fundamentally new strategies for grid operations including transactive energy \[38].

The colocation of customer-sited resources and loads - including demand response - means non-utility DERs could provide multiple services traditionally delivered through utility-owned assets. 15 Importantly, the internet connectivity of DERs in this scenario means the device owner/operator could choose whether to optimize function around local concerns or those of a more regional or global nature.

15 For example, DERs such as solar photovoltaic or demand response can reduce peak demand during the mid-part of the day while an energy storage asset can supply reactive power.

:::{figure} pictures/picture-007.png
:alt: System Operations; Utility Service Providers; & Trans Ops; Generation; Distribution Ops; Ops Services; Business Systems; Management; Energy; Advanced Distribution Management; System; Management; Enterprise; Asset; Planning Tools; Modeling &; System; Service Providers; Third-Party; Info System; Customer; Billing; Enterprise; Resource; Planning; Management; Generation; System; System; Management; Economic and; Outage; Grid Optimization; State Estimation; Distributed; &; Information; Geographic; System; Management; Workforce; System; Aggregated; Systems; Control; System; Automated; Reliability; Energy Resources; Generation; Management; Management Sys.; Business Systems; Control; Gateway; DR Head; 3rd Party Head-; End System; End; Operational Enterprise Service Bus; Admin Enterprise Service Bus; Meter Data; Weather; Service; Advanced; Analytics; Load Profile; Calculation; Advanced Load; Forecasting; System (MDMS); Management; Internet; Internet; Energy; Gateway, Data; Market; Translator, IP SCADA; Source: NIST Smart Grid Framework 4.0; Clearinghouse; Communications; Intelligent; Ancillary; Services; Distributed; Controllers; Electronic; Devices; DLC; &; LAN / WAN; Systems and; Smart; Market; DR; Appliances; Clearinghouse; LAN/WAN; Devices; AMI Telemetry; Clearinghouse; Dispatch; Capacity; Market; Energy; Generator; Control; System; Substation; Devices; Substation; Cap Banks/; Controllers; Advanced; formers; Trans-; Sensors; Circuit; vo; Fault; Meer; Utility; Network; Home Area; Gateway; Control and; Automation; Industrial; Systems; Building; Customer Systems; Account; App; Email; Apps; Service; Order; App; Legend; Ancillary; Services; Dispatch; Generator; Bulk; Bulk; Controller; Distribution; Indicators; Switches; Remote; Sub Meter; Smart; HVAC; Billing; App; Energy; Auditc; Apps; Usage; APdps; Domain; Comm Network; Congestion; Generator; Automation; T-stat; Devices; Outage; Management; Bulk; Transmission; Distribution; Apps; Roles and Actors; Generator; Generation; Co-; Smart; DR; 0; Gateway Role; Markets; S; Generation including DER; Participating; Load; Participating; Generation; DER; Storage; Energy; incling; Inverter; Storage; Energy; DER; Devices; Electric; Vehicle; Customer; Comms Path Changes; Comms Path; Owner / Domain

Figure 6 - High-DER communication pathways scenario
:::
