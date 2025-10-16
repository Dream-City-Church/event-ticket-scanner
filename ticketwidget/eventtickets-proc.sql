SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROCEDURE [dbo].[api_custom_EventTickets]
	@Username nvarchar(75) = null,
    @DomainID int,
    @ContactGuid uniqueidentifier,
    @EventId int
AS
BEGIN

DECLARE @ContactId INT = (SELECT TOP 1 C.Contact_ID FROM Contacts C WHERE C.Contact_GUID = @ContactGuid);

SELECT
  E.Event_Title
  , DATEADD(hour,7,E.Event_Start_Date) AS Event_Start_Date
  , EP.Event_Participant_ID
  , CEP.Contact_ID
  , CEP.Nickname
  , CEP.Last_Name
  , CEP.Email_Address
  , CEP.Mobile_Phone
  , STRING_AGG(POG.Option_Group_Name + ': ' + POP.Option_Title, ', ') AS Selected_Options
  , ISNULL(CAST((SELECT SUM(NULLIF(ID.Line_Total,0)) FROM Invoice_Detail ID WHERE ID.Event_Participant_ID = EP.Event_Participant_ID) AS VARCHAR(20)),'0.00') AS Registration_Fee
  , EP.Participation_Status_ID
FROM Events E
  JOIN Event_Participants EP ON EP.Event_ID = E.Event_ID
  JOIN Contacts CEP ON CEP.Participant_Record = EP.Participant_ID
  LEFT JOIN Contacts CH ON CH.Household_ID = CEP.Household_ID
  LEFT JOIN Invoice_Detail ID ON ID.Event_Participant_ID = EP.Event_Participant_ID
  LEFT JOIN Invoices I ON I.Invoice_ID = ID.Invoice_ID
  LEFT JOIN Product_Option_Prices POP ON POP.Product_Option_Price_ID = ID.Product_Option_Price_ID
  LEFT JOIN Product_Option_Groups POG ON POG.Product_Option_Group_ID = POP.Product_Option_Group_ID
WHERE (@ContactId IN (CEP.Contact_ID,I.Purchaser_Contact_ID)
  AND EP.Event_ID = @EventId
  AND EP.Participation_Status_ID < 5)
  OR (@ContactId = CH.Contact_ID
    AND EP.Event_ID = @EventId
    AND EP.Participation_Status_ID < 5
    AND CH.Household_Position_ID = 1
    AND CEP.Contact_ID <> CH.Contact_ID)
  AND E.Domain_ID = @DomainID
GROUP BY E.Event_Title, E.Event_Start_Date, EP.Event_Participant_ID, CEP.Nickname, CEP.Last_Name, CEP.Email_Address, CEP.Mobile_Phone, CEP.Contact_ID, EP.Participation_Status_ID
ORDER BY CEP.Nickname, CEP.Last_Name;

END
GO
